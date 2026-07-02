import { EventEmitter } from 'events'
import {
  AudioPlayerStatus,
  VoiceConnectionStatus,
  createAudioPlayer,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  type AudioPlayer,
  type DiscordGatewayAdapterCreator,
  type VoiceConnection
} from '@discordjs/voice'
import {
  DEFAULT_AUDIO_EFFECTS,
  type AudioEffects,
  type AuditAction,
  type GuildPlayerState,
  type LoopMode,
  type PlayerControl,
  type PlayerStatus,
  type Track,
  type TrackRequester
} from '@shared/types'
import { logger } from '../logger'
import { addAudit } from './audit'
import {
  createTrackResource,
  effectsActive,
  sanitizeEffects,
  type ManagedAudioResource
} from './audio'
import { TrackQueue } from './queue'
import { getGuildSettings, setGuildSettings } from './settings'
import {
  applyWindowsPlaybackTuning,
  restoreWindowsPlaybackTuning
} from './windows-tuning'

/** Leave the channel this long after the queue runs dry (when auto-leave is on). */
const AUTO_LEAVE_DELAY_MS = 60_000

/** Rejoin delays after an unexpected voice disconnect (roughly a minute total). */
const RECONNECT_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000]

/**
 * A connection that sat idle this long is rebuilt before the next track starts.
 * Long-lived idle voice connections accumulate playback lag (discordjs#5118);
 * a fresh join clears it.
 */
const STALE_CONNECTION_MS = 5 * 60_000

/** Retry an errored track only when it died this early (a startup failure). */
const RETRY_WINDOW_MS = 15_000

/**
 * A track that ends this much before its known duration didn't finish - the
 * source starved (stalled read, dropped stream) - so resume it in place once.
 * Generous because metadata durations (VBR files, live-ish sources) drift.
 */
const PREMATURE_END_GRACE_MS = 10_000

/** How the service exposes the live discord.js guild to a player. */
export interface GuildContext {
  adapterCreator: DiscordGatewayAdapterCreator
  /** Resolve a voice channel's display name, or null when it's gone. */
  channelName: (channelId: string) => string | null
}

/**
 * One guild's music player: owns the voice connection, the @discordjs/voice
 * AudioPlayer, and a {@link TrackQueue}. UI actions and slash commands call the
 * same methods here, so both stay in sync. Emits `state` (GuildPlayerState) on
 * every change and records an audit entry for each meaningful action.
 */
export class GuildMusicPlayer extends EventEmitter {
  private readonly queue = new TrackQueue()
  private readonly player: AudioPlayer
  private connection: VoiceConnection | null = null
  private resource: ManagedAudioResource | null = null
  private voiceChannelId: string | null = null
  private status: PlayerStatus = 'idle'
  private volume: number
  private effects: AudioEffects = DEFAULT_AUDIO_EFFECTS
  private pendingSkip = false
  private trackErrored = false
  private retriedCurrentTrack = false
  private reconnecting = false
  private seekOffsetMs = 0
  private lastSeekAt = 0
  private idleSince: number | null = null
  private bufferingSince: number | null = null
  private autoLeaveTimer: ReturnType<typeof setTimeout> | null = null
  private effectsTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly guildId: string,
    private readonly ctx: GuildContext
  ) {
    super()
    this.volume = getGuildSettings(guildId).defaultVolume
    this.player = createAudioPlayer({
      behaviors: {
        // 100 frames = 2s of underrun grace. A stalled source (network hiccup,
        // first-read antivirus scan on a local file) inserts silence instead of
        // killing the track outright.
        maxMissedFrames: 100,
        noSubscriber: NoSubscriberBehavior.Pause
      }
    })

    this.player.on('stateChange', (oldState, newState) => {
      switch (newState.status) {
        case AudioPlayerStatus.Playing:
          this.status = 'playing'
          break
        case AudioPlayerStatus.Paused:
        case AudioPlayerStatus.AutoPaused:
          this.status = 'paused'
          break
        case AudioPlayerStatus.Buffering:
          this.status = 'buffering'
          break
        default:
          this.status = 'idle'
      }
      this.logPlayerTransition(oldState.status, newState.status)
      // A track finished (or was stopped): advance the queue exactly once on the
      // transition into Idle.
      if (
        newState.status === AudioPlayerStatus.Idle &&
        oldState.status !== AudioPlayerStatus.Idle
      ) {
        this.onTrackEnd()
      }
      this.emitState()
    })

    // The Idle transition that follows performs the advance/retry; flagging here
    // (instead of advancing) avoids double-advancing past a track.
    this.player.on('error', (err) => {
      logger.warn(`Discord audio error in guild ${guildId}:`, err.message)
      this.trackErrored = true
    })
  }

  get connected(): boolean {
    return this.connection != null
  }

  async join(channelId: string, requester: TrackRequester): Promise<void> {
    if (this.connection && this.voiceChannelId !== channelId) {
      this.connection.destroy()
      this.connection = null
    }
    if (!this.connection) {
      this.connectTo(channelId)
      void applyWindowsPlaybackTuning()
    }
    this.voiceChannelId = channelId
    setGuildSettings(this.guildId, { lastVoiceChannelId: channelId })
    this.audit(requester, 'join', this.ctx.channelName(channelId) ?? channelId)
    this.emitState()
  }

  leave(requester: TrackRequester): void {
    this.clearAutoLeave()
    this.destroyResource()
    this.queue.stop()
    this.player.stop(true)
    this.connection?.destroy()
    this.connection = null
    this.voiceChannelId = null
    this.status = 'idle'
    void restoreWindowsPlaybackTuning()
    this.audit(requester, 'leave', '')
    this.emitState()
  }

  enqueue(tracks: Track[], requester: TrackRequester): void {
    if (tracks.length === 0) return
    this.clearAutoLeave()
    this.queue.add(tracks)
    const detail = tracks.length === 1 ? tracks[0].title : `${tracks.length} tracks`
    this.audit(requester, 'enqueue', detail)
    // Start playback if we were idle (nothing currently playing).
    if (!this.queue.nowPlaying) {
      this.advanceAndPlay(false)
    } else {
      this.emitState()
    }
  }

  control(action: PlayerControl, requester: TrackRequester): void {
    switch (action) {
      case 'skip':
        this.skip(requester)
        break
      case 'pause':
        if (this.status === 'playing') {
          this.player.pause()
          this.audit(requester, 'pause', this.queue.nowPlaying?.title ?? '')
        }
        break
      case 'resume':
        if (this.status === 'paused') {
          this.player.unpause()
          this.audit(requester, 'resume', this.queue.nowPlaying?.title ?? '')
        }
        break
      case 'stop':
        this.audit(requester, 'stop', '')
        this.queue.stop()
        this.destroyResource()
        this.player.stop(true)
        break
      case 'shuffle':
        this.queue.shuffle()
        this.audit(requester, 'shuffle', '')
        this.emitState()
        break
      case 'clear':
        this.clearQueue(requester)
        break
    }
  }

  setLoop(mode: LoopMode, requester: TrackRequester): void {
    this.queue.loop = mode
    this.audit(requester, 'loop', mode)
    this.emitState()
  }

  setVolume(volume: number, requester: TrackRequester): void {
    this.volume = Math.max(0, Math.min(100, Math.round(volume)))
    this.resource?.volume?.setVolume(this.volume / 100)
    setGuildSettings(this.guildId, { defaultVolume: this.volume })
    this.audit(requester, 'volume', String(this.volume))
    this.emitState()
  }

  /**
   * Apply playback effects (speed / pitch / EQ / character). The ffmpeg leg of
   * the pipeline renders them, so the current track restarts at its current
   * position with the new chain. Restarts are trailing-debounced: every change
   * respawns the stream processes, and the last value must always win.
   */
  setEffects(effects: Partial<AudioEffects>, requester: TrackRequester): void {
    this.effects = sanitizeEffects(effects)
    this.audit(requester, 'effects', formatEffectsDetail(this.effects))
    if (this.effectsTimer) clearTimeout(this.effectsTimer)
    this.effectsTimer = setTimeout(() => {
      this.effectsTimer = null
      const current = this.queue.nowPlaying
      if (!current) return
      const positionSeconds = Math.max(0, Math.floor(this.getState().positionMs / 1000))
      if (this.startTrack(current, positionSeconds)) this.emitState()
    }, 350)
    this.emitState()
  }

  removeTrack(index: number, requester: TrackRequester): void {
    const removed = this.queue.removeAt(index)
    if (removed) {
      this.audit(requester, 'remove', removed.title)
      this.emitState()
    }
  }

  /** Reorder an upcoming track (e.g. "play next" moves it to index 0). */
  moveTrack(from: number, to: number, requester: TrackRequester): void {
    const moved = this.queue.move(from, to)
    if (moved) {
      this.audit(requester, 'move', moved.title)
      this.emitState()
    }
  }

  /**
   * Restart the current track at `seconds`, keeping queue and status intact.
   * Rapid calls are coalesced: each seek tears down and respawns the stream
   * pipeline, so a barrage (slider scrubbing) would thrash yt-dlp/ffmpeg.
   */
  seek(seconds: number, requester: TrackRequester): void {
    const current = this.queue.nowPlaying
    if (!current) return
    const now = Date.now()
    if (now - this.lastSeekAt < 400) return
    this.lastSeekAt = now
    const max =
      current.duration != null
        ? Math.max(0, current.duration - 1)
        : Number.MAX_SAFE_INTEGER
    const target = Math.max(0, Math.min(Math.floor(seconds), max))
    if (this.startTrack(current, target)) {
      this.audit(requester, 'seek', formatSeekDetail(target))
      this.emitState()
    }
  }

  /** Clear only the upcoming queue; the current track keeps playing. */
  clearQueue(requester: TrackRequester): void {
    this.queue.clear()
    this.audit(requester, 'clear', '')
    this.emitState()
  }

  getState(): GuildPlayerState {
    const snap = this.queue.snapshot()
    return {
      guildId: this.guildId,
      voiceChannelId: this.voiceChannelId,
      status: this.status,
      nowPlaying: snap.nowPlaying,
      queue: snap.queue,
      loop: snap.loop,
      volume: this.volume,
      // playbackDuration is wall-clock output time; at speed != 1 the media
      // position advances faster/slower than the clock.
      positionMs:
        this.seekOffsetMs + (this.resource?.playbackDuration ?? 0) * this.effects.speed,
      effects: this.effects
    }
  }

  /** Tear down processes and the voice connection (used on shutdown). */
  destroy(): void {
    this.clearAutoLeave()
    if (this.effectsTimer) {
      clearTimeout(this.effectsTimer)
      this.effectsTimer = null
    }
    this.destroyResource()
    this.player.stop(true)
    this.connection?.destroy()
    this.connection = null
    this.voiceChannelId = null
    void restoreWindowsPlaybackTuning()
    this.removeAllListeners()
  }

  private skip(requester: TrackRequester): void {
    if (!this.queue.nowPlaying) return
    this.audit(requester, 'skip', this.queue.nowPlaying.title)
    this.pendingSkip = true
    // Triggers the Idle transition, which advances with skip semantics.
    this.player.stop(true)
  }

  private onTrackEnd(): void {
    const skip = this.pendingSkip
    const errored = this.trackErrored
    this.pendingSkip = false
    this.trackErrored = false
    const current = this.queue.nowPlaying
    const playedMs = this.resource?.playbackDuration ?? 0
    // A track that errored right after starting is usually a transient stream
    // failure - rebuild it once before giving up and advancing.
    if (
      errored &&
      !skip &&
      current &&
      !this.retriedCurrentTrack &&
      playedMs < RETRY_WINDOW_MS
    ) {
      this.retriedCurrentTrack = true
      logger.info(
        `Retrying track after early stream error in guild ${this.guildId}:`,
        current.title
      )
      if (this.startTrack(current)) {
        this.emitState()
        return
      }
    }
    // A track that went Idle well before its known duration was starved, not
    // finished (e.g. a stalled first read of a local file). Resume it once
    // from where it stopped instead of silently dropping the rest.
    const positionMs = this.seekOffsetMs + playedMs * this.effects.speed
    const expectedMs = current?.duration != null ? current.duration * 1000 : null
    if (
      !skip &&
      !errored &&
      current &&
      !this.retriedCurrentTrack &&
      expectedMs != null &&
      positionMs > 0 &&
      expectedMs - positionMs > PREMATURE_END_GRACE_MS
    ) {
      this.retriedCurrentTrack = true
      logger.warn(
        `Track ended ${Math.round((expectedMs - positionMs) / 1000)}s early in guild ${this.guildId}, resuming:`,
        current.title
      )
      if (this.startTrack(current, Math.floor(positionMs / 1000))) {
        this.emitState()
        return
      }
    }
    this.advanceAndPlay(skip)
  }

  private advanceAndPlay(skip: boolean): void {
    this.destroyResource()
    const next = this.queue.advance(skip)
    if (!next) {
      this.status = 'idle'
      this.idleSince = Date.now()
      this.scheduleAutoLeave()
      this.emitState()
      return
    }
    this.retriedCurrentTrack = false
    if (!this.startTrack(next)) {
      this.advanceAndPlay(false)
      return
    }
    this.audit(next.requestedBy, 'play', next.title)
    this.emitState()
  }

  /** Build and play a resource for `track`. Returns false when it failed to start. */
  private startTrack(track: Track, seekSeconds = 0): boolean {
    this.destroyResource()
    this.refreshStaleConnection()
    try {
      // Backfill an unknown duration from the ffmpeg banner (downloads and
      // local imports are queued without one) so the seek bar comes alive and
      // the premature-end guard has something to compare against.
      this.resource = createTrackResource(track, seekSeconds, this.effects, (seconds) => {
        if (track.duration == null && this.queue.nowPlaying === track) {
          track.duration = seconds
          this.emitState()
        }
      })
      this.resource.volume?.setVolume(this.volume / 100)
      this.player.play(this.resource)
      this.seekOffsetMs = seekSeconds * 1000
      this.idleSince = null
      return true
    } catch (err) {
      logger.warn('Failed to start track, skipping:', track.title, err)
      return false
    }
  }

  private connectTo(channelId: string): VoiceConnection {
    const connection = joinVoiceChannel({
      channelId,
      guildId: this.guildId,
      adapterCreator: this.ctx.adapterCreator,
      selfDeaf: true
    })
    connection.subscribe(this.player)
    this.connection = connection
    this.wireConnection(connection)
    this.voiceChannelId = channelId
    return connection
  }

  /** Rebuild a connection that idled long enough to accumulate playback lag. */
  private refreshStaleConnection(): void {
    if (!this.connection || !this.voiceChannelId || !this.idleSince) return
    const idleMs = Date.now() - this.idleSince
    if (idleMs < STALE_CONNECTION_MS) return
    logger.info(
      `Refreshing stale voice connection in guild ${this.guildId} (idle ${Math.round(idleMs / 60_000)}m)`
    )
    const channelId = this.voiceChannelId
    this.connection.destroy()
    this.connection = null
    this.connectTo(channelId)
  }

  private wireConnection(connection: VoiceConnection): void {
    connection.on('stateChange', (oldState, newState) => {
      if (this.connection === connection && oldState.status !== newState.status) {
        logger.debug(
          `Voice connection in guild ${this.guildId}: ${oldState.status} -> ${newState.status}`
        )
      }
    })
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      if (this.connection !== connection) return
      try {
        // A brief signalling/connecting flicker is a move/region change, not a
        // real disconnect - wait it out before tearing down.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
        ])
      } catch {
        connection.destroy()
        if (this.connection === connection) {
          this.connection = null
          void this.attemptReconnect()
        }
      }
    })
  }

  /** Rejoin the last channel with backoff after an unexpected disconnect. */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnecting) return
    const channelId = this.voiceChannelId
    if (!channelId) {
      this.markDisconnected()
      return
    }
    this.reconnecting = true
    logger.warn(`Voice disconnected in guild ${this.guildId}, attempting to rejoin`)
    try {
      for (let attempt = 0; attempt < RECONNECT_DELAYS_MS.length; attempt++) {
        await sleep(RECONNECT_DELAYS_MS[attempt])
        // The user may have left or rejoined manually while we waited.
        if (this.connection || this.voiceChannelId !== channelId) return
        let connection: VoiceConnection | null = null
        try {
          connection = this.connectTo(channelId)
          await entersState(connection, VoiceConnectionStatus.Ready, 10_000)
          logger.info(
            `Voice reconnected in guild ${this.guildId} (attempt ${attempt + 1})`
          )
          if (this.player.state.status === AudioPlayerStatus.AutoPaused) {
            this.player.unpause()
          }
          this.emitState()
          return
        } catch {
          logger.warn(
            `Voice reconnect attempt ${attempt + 1} failed in guild ${this.guildId}`
          )
          connection?.destroy()
          this.connection = null
        }
      }
      logger.error(`Voice reconnect failed in guild ${this.guildId}; giving up`)
      this.markDisconnected()
    } finally {
      this.reconnecting = false
    }
  }

  private markDisconnected(): void {
    this.connection = null
    this.voiceChannelId = null
    this.status = 'idle'
    void restoreWindowsPlaybackTuning()
    this.emitState()
  }

  private logPlayerTransition(
    oldStatus: AudioPlayerStatus,
    newStatus: AudioPlayerStatus
  ): void {
    if (oldStatus === newStatus) return
    if (newStatus === AudioPlayerStatus.Buffering) {
      this.bufferingSince = Date.now()
    } else if (oldStatus === AudioPlayerStatus.Buffering && this.bufferingSince) {
      logger.debug(
        `Playback buffered ${Date.now() - this.bufferingSince}ms in guild ${this.guildId}`
      )
      this.bufferingSince = null
    }
    if (newStatus === AudioPlayerStatus.AutoPaused) {
      logger.info(`Playback auto-paused (no voice subscriber) in guild ${this.guildId}`)
    }
  }

  private scheduleAutoLeave(): void {
    this.clearAutoLeave()
    if (!getGuildSettings(this.guildId).autoLeaveOnEmpty) return
    this.autoLeaveTimer = setTimeout(() => {
      if (this.queue.isEmpty && this.connection) {
        logger.info(`Auto-leaving voice in guild ${this.guildId} (queue empty)`)
        this.leave({ source: 'ui', userId: null, username: 'Auto-leave' })
      }
    }, AUTO_LEAVE_DELAY_MS)
  }

  private clearAutoLeave(): void {
    if (this.autoLeaveTimer) {
      clearTimeout(this.autoLeaveTimer)
      this.autoLeaveTimer = null
    }
  }

  private destroyResource(): void {
    this.resource?.destroyStream()
    this.resource = null
    this.seekOffsetMs = 0
  }

  private audit(actor: TrackRequester, action: AuditAction, detail: string): void {
    addAudit({ guildId: this.guildId, actor, action, detail })
  }

  private emitState(): void {
    this.emit('state', this.getState())
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatSeekDetail(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `to ${m}:${String(s).padStart(2, '0')}`
}

function formatEffectsDetail(effects: AudioEffects): string {
  if (!effectsActive(effects)) return 'reset'
  const parts: string[] = []
  if (effects.speed !== 1) parts.push(`${effects.speed}× speed`)
  if (effects.pitch !== 1) parts.push(`${effects.pitch}× pitch`)
  if (effects.bassGain !== 0 || effects.midGain !== 0 || effects.trebleGain !== 0) {
    parts.push(`EQ ${effects.bassGain}/${effects.midGain}/${effects.trebleGain}`)
  }
  if (effects.mode !== 'none') parts.push(effects.mode)
  return parts.join(' · ')
}
