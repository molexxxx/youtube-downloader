import { EventEmitter } from 'events'
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  PermissionsBitField,
  type Guild,
  type Interaction
} from 'discord.js'
import type {
  DiscordConnectionState,
  DiscordGuild,
  DiscordStatus,
  GuildPlayerState,
  TrackInput,
  TrackRequester
} from '@shared/types'
import { logger } from '../logger'
import { GuildMusicPlayer } from './player'
import { registerGuildCommands, handleInteraction } from './commands'
import { hasToken } from './token'

// Permissions the bot needs in a server: see/send in text channels, embed links
// for now-playing messages, and join/speak in voice.
const INVITE_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak
]).bitfield.toString()

/**
 * Owns the discord.js gateway client and one {@link GuildMusicPlayer} per guild.
 * Emits `status` (DiscordStatus), `guilds` (DiscordGuild[]), and `player`
 * (GuildPlayerState) so the IPC layer can forward live updates to the renderer.
 */
export class DiscordService extends EventEmitter {
  private client: Client | null = null
  private state: DiscordConnectionState = 'disconnected'
  private error: string | null = null
  private applicationId: string | null = null
  private botUser: DiscordStatus['botUser'] = null
  private readonly players = new Map<string, GuildMusicPlayer>()

  getStatus(): DiscordStatus {
    return {
      state: this.state,
      botUser: this.botUser,
      applicationId: this.applicationId,
      hasToken: hasToken(),
      inviteUrl: this.inviteUrl(),
      error: this.error
    }
  }

  getGuilds(): DiscordGuild[] {
    if (!this.client) return []
    return [...this.client.guilds.cache.values()].map((g) => this.mapGuild(g))
  }

  /** The live player for a guild, created lazily. Null when the guild is unknown. */
  playerFor(guildId: string): GuildMusicPlayer | null {
    const existing = this.players.get(guildId)
    if (existing) return existing
    const guild = this.client?.guilds.cache.get(guildId)
    if (!guild) return null
    const player = new GuildMusicPlayer(guildId, {
      adapterCreator: guild.voiceAdapterCreator,
      channelName: (id) => guild.channels.cache.get(id)?.name ?? null
    })
    player.on('state', (state) => this.emit('player', state))
    this.players.set(guildId, player)
    return player
  }

  /** Current state of a guild's player, or null when none has been created yet. */
  getPlayerState(guildId: string): GuildPlayerState | null {
    return this.players.get(guildId)?.getState() ?? null
  }

  /** Stamp enqueue inputs with the requester and add them to a guild's queue. */
  enqueue(guildId: string, inputs: TrackInput[], requester: TrackRequester): boolean {
    const player = this.playerFor(guildId)
    if (!player) return false
    const now = Date.now()
    const tracks = inputs.map((input, i) => ({
      id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      title: input.title,
      url: input.url,
      duration: input.duration,
      thumbnail: input.thumbnail,
      requestedBy: requester,
      addedAt: now
    }))
    player.enqueue(tracks, requester)
    return true
  }

  async login(token: string): Promise<void> {
    await this.disconnect()
    this.setState('connecting', null)

    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
    })
    this.client = client

    client.once(Events.ClientReady, (ready) => {
      this.applicationId = ready.application?.id ?? ready.user.id
      this.botUser = {
        id: ready.user.id,
        username: ready.user.username,
        avatar: ready.user.displayAvatarURL({ size: 64 })
      }
      this.setState('ready', null)
      this.emitGuilds()
      logger.info('Discord bot ready as', ready.user.tag)
      for (const guild of client.guilds.cache.values()) {
        void registerGuildCommands(client, guild.id)
      }
    })

    client.on(Events.GuildCreate, (guild) => {
      logger.info('Discord bot added to guild', guild.name)
      void registerGuildCommands(client, guild.id)
      this.emitGuilds()
    })
    client.on(Events.GuildDelete, () => this.emitGuilds())
    client.on(Events.GuildUpdate, () => this.emitGuilds())
    client.on(Events.ChannelCreate, () => this.emitGuilds())
    client.on(Events.ChannelDelete, () => this.emitGuilds())
    client.on(Events.GuildRoleCreate, () => this.emitGuilds())
    client.on(Events.GuildRoleDelete, () => this.emitGuilds())
    client.on(Events.InteractionCreate, (interaction: Interaction) => {
      void handleInteraction(this, interaction)
    })
    client.on(Events.Error, (err) => logger.warn('Discord client error:', err.message))

    try {
      await client.login(token)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn('Discord login failed:', message)
      this.client = null
      this.setState('error', message)
      throw err
    }
  }

  async disconnect(): Promise<void> {
    for (const player of this.players.values()) player.destroy()
    this.players.clear()
    if (this.client) {
      await this.client.destroy()
      this.client = null
    }
    this.botUser = null
    this.applicationId = null
    this.setState('disconnected', null)
  }

  private inviteUrl(): string | null {
    if (!this.applicationId) return null
    const params = new URLSearchParams({
      client_id: this.applicationId,
      permissions: INVITE_PERMISSIONS,
      scope: 'bot applications.commands'
    })
    return `https://discord.com/oauth2/authorize?${params.toString()}`
  }

  private mapGuild(guild: Guild): DiscordGuild {
    const voiceChannels = guild.channels.cache
      .filter(
        (c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
      )
      .map((c) => ({ id: c.id, name: c.name }))
    const roles = guild.roles.cache
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.hexColor && r.hexColor !== '#000000' ? r.hexColor : null
      }))
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ size: 64 }),
      voiceChannels,
      roles
    }
  }

  private setState(state: DiscordConnectionState, error: string | null): void {
    this.state = state
    this.error = error
    this.emit('status', this.getStatus())
  }

  private emitGuilds(): void {
    this.emit('guilds', this.getGuilds())
  }
}

let service: DiscordService | null = null

export function getDiscordService(): DiscordService {
  if (!service) service = new DiscordService()
  return service
}
