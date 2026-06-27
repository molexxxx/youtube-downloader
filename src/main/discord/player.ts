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
import type {
  AuditAction,
  GuildPlayerState,
  LoopMode,
  PlayerControl,
  PlayerStatus,
  Track,
  TrackRequester
} from '@shared/types'
import { logger } from '../logger'
import { addAudit } from './audit'
import { createTrackResource, type ManagedAudioResource } from './audio'
import { TrackQueue } from './queue'
import { getGuildSettings, setGuildSettings } from './settings'
import { applyWindowsPlaybackTuning, restoreWindowsPlaybackTuning } from './windows-tuning'

/** Leave the channel this long after the queue runs dry (when auto-leave is on). */
const AUTO_LEAVE_DELAY_MS = 60_000

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
  private pendingSkip = false
  private autoLeaveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly guildId: string,
    private readonly ctx: GuildContext
  ) {
    super()
    this.volume = getGuildSettings(guildId).defaultVolume
    this.player = createAudioPlayer({
      behaviors: {
        maxMissedFrames: 10,
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

    this.player.on('error', (err) => {
      logger.warn(`Discord audio error in guild ${guildId}:`, err.message)
      this.onTrackEnd()
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
      this.connection = joinVoiceChannel({
        channelId,
        guildId: this.guildId,
        adapterCreator: this.ctx.adapterCreator,
        selfDeaf: true
      })
      this.connection.subscribe(this.player)
      this.wireConnection(this.connection)
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
    this.audit(requester, 'leave', '')
    this.emitState()
  }

  enqueue(tracks: Track[], requester: TrackRequester): void {
    if (tracks.length === 0) return
    this.clearAutoLeave()
    this.queue.add(tracks)
    const detail =
      tracks.length === 1 ? tracks[0].title : `${tracks.length} tracks`
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

  removeTrack(index: number, requester: TrackRequester): void {
    const removed = this.queue.removeAt(index)
    if (removed) {
      this.audit(requester, 'remove', removed.title)
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
      volume: this.volume
    }
  }

  /** Tear down processes and the voice connection (used on shutdown). */
  destroy(): void {
    this.clearAutoLeave()
    this.destroyResource()
    this.player.stop(true)
    this.connection?.destroy()
    this.connection = null
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
    this.pendingSkip = false
    this.advanceAndPlay(skip)
  }

  private advanceAndPlay(skip: boolean): void {
    this.destroyResource()
    const next = this.queue.advance(skip)
    if (!next) {
      this.status = 'idle'
      this.scheduleAutoLeave()
      this.emitState()
      return
    }
    try {
      this.resource = createTrackResource(next)
      this.resource.volume?.setVolume(this.volume / 100)
      applyWindowsPlaybackTuning()
      this.player.play(this.resource)
      this.audit(next.requestedBy, 'play', next.title)
    } catch (err) {
      logger.warn('Failed to start track, skipping:', next.title, err)
      this.advanceAndPlay(false)
      return
    }
    this.emitState()
  }

  private wireConnection(connection: VoiceConnection): void {
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
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
          this.voiceChannelId = null
          this.status = 'idle'
          this.emitState()
        }
      }
    })
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
    restoreWindowsPlaybackTuning()
  }

  private audit(actor: TrackRequester, action: AuditAction, detail: string): void {
    addAudit({ guildId: this.guildId, actor, action, detail })
  }

  private emitState(): void {
    this.emit('state', this.getState())
  }
}
