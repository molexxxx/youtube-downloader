import {
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction
} from 'discord.js'
import type { LoopMode, PlayerControl, TrackRequester } from '@shared/types'
import { logger } from '../logger'
import { addAudit } from './audit'
import type { DiscordService } from './client'
import { canControl, type MemberContext } from './permissions'
import { resolveQueryToTracks } from './resolve'

/** Commands anyone may run regardless of the allowed-role gate. */
const READ_ONLY = new Set(['queue', 'nowplaying'])

function buildCommands(): SlashCommandBuilder[] {
  const text = (name: string, description: string): SlashCommandBuilder =>
    new SlashCommandBuilder().setName(name).setDescription(description)

  return [
    text('play', 'Play a song or playlist (YouTube URL or search text)').addStringOption((o) =>
      o.setName('query').setDescription('YouTube URL or search text').setRequired(true)
    ) as SlashCommandBuilder,
    text('search', 'Search YouTube and queue the top result').addStringOption((o) =>
      o.setName('query').setDescription('Search text').setRequired(true)
    ) as SlashCommandBuilder,
    text('skip', 'Skip the current track'),
    text('stop', 'Stop playback and clear the queue'),
    text('pause', 'Pause playback'),
    text('resume', 'Resume playback'),
    text('queue', 'Show the current queue'),
    text('nowplaying', 'Show the current track'),
    text('shuffle', 'Shuffle the upcoming queue'),
    text('clear', 'Clear the upcoming queue'),
    text('join', 'Join your voice channel'),
    text('leave', 'Leave the voice channel'),
    text('loop', 'Set the loop mode').addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'off', value: 'off' },
          { name: 'track', value: 'track' },
          { name: 'queue', value: 'queue' }
        )
    ) as SlashCommandBuilder,
    text('volume', 'Set playback volume (0-100)').addIntegerOption((o) =>
      o
        .setName('percent')
        .setDescription('0-100')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100)
    ) as SlashCommandBuilder,
    text('remove', 'Remove a track from the queue by position').addIntegerOption((o) =>
      o
        .setName('position')
        .setDescription('1-based queue position')
        .setRequired(true)
        .setMinValue(1)
    ) as SlashCommandBuilder
  ]
}

/** Register the command set for a single guild (instant availability). */
export async function registerGuildCommands(client: Client, guildId: string): Promise<void> {
  try {
    await client.application?.commands.set(
      buildCommands().map((c) => c.toJSON()),
      guildId
    )
  } catch (err) {
    logger.warn(
      'Failed to register slash commands for guild',
      guildId,
      err instanceof Error ? err.message : String(err)
    )
  }
}

function memberVoiceChannelId(interaction: ChatInputCommandInteraction): string | null {
  const member = interaction.member as GuildMember | null
  return (
    member?.voice?.channelId ??
    interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId ??
    null
  )
}

/**
 * Handle a slash command by calling the same {@link GuildMusicPlayer} methods the
 * UI uses, so playback state stays identical whether driven from Discord or the
 * desktop app.
 */
export async function handleInteraction(
  service: DiscordService,
  interaction: Interaction
): Promise<void> {
  if (!interaction.isChatInputCommand()) return
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: 'These commands only work inside a server.',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const guildId = interaction.guildId
  const command = interaction.commandName
  const requester: TrackRequester = {
    source: 'discord',
    userId: interaction.user.id,
    username: interaction.user.username
  }

  if (!READ_ONLY.has(command)) {
    const member = interaction.member as GuildMember | null
    const ctx: MemberContext = {
      userId: interaction.user.id,
      roleIds: member ? [...member.roles.cache.keys()] : [],
      isAdministrator: Boolean(
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
      ),
      isGuildOwner: interaction.guild?.ownerId === interaction.user.id
    }
    if (!canControl(guildId, ctx)) {
      addAudit({ guildId, actor: requester, action: 'permission-denied', detail: command })
      await interaction.reply({
        content: 'You do not have permission to control playback here.',
        flags: MessageFlags.Ephemeral
      })
      return
    }
  }

  const player = service.playerFor(guildId)
  if (!player) {
    await interaction.reply({
      content: 'This server is not ready yet - try again in a moment.',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  try {
    switch (command) {
      case 'play':
      case 'search': {
        await interaction.deferReply()
        const query = interaction.options.getString('query', true)
        const channelId = memberVoiceChannelId(interaction)
        if (!player.connected && !channelId) {
          await interaction.editReply('Join a voice channel first.')
          return
        }
        if (channelId && !player.connected) await player.join(channelId, requester)
        const inputs = await resolveQueryToTracks(query)
        if (inputs.length === 0) {
          await interaction.editReply('No results found.')
          return
        }
        service.enqueue(guildId, inputs, requester)
        await interaction.editReply(
          inputs.length === 1 ? `Added **${inputs[0].title}**` : `Added **${inputs.length}** tracks`
        )
        return
      }
      case 'join': {
        const channelId = memberVoiceChannelId(interaction)
        if (!channelId) {
          await interaction.reply({
            content: 'Join a voice channel first.',
            flags: MessageFlags.Ephemeral
          })
          return
        }
        await player.join(channelId, requester)
        await interaction.reply({
          content: 'Joined your voice channel.',
          flags: MessageFlags.Ephemeral
        })
        return
      }
      case 'leave':
        player.leave(requester)
        await interaction.reply({ content: 'Left the voice channel.', flags: MessageFlags.Ephemeral })
        return
      case 'skip':
      case 'pause':
      case 'resume':
      case 'stop':
      case 'shuffle':
        player.control(command as PlayerControl, requester)
        await interaction.reply({ content: `Done: ${command}.`, flags: MessageFlags.Ephemeral })
        return
      case 'clear':
        player.clearQueue(requester)
        await interaction.reply({ content: 'Cleared the queue.', flags: MessageFlags.Ephemeral })
        return
      case 'loop': {
        const mode = interaction.options.getString('mode', true) as LoopMode
        player.setLoop(mode, requester)
        await interaction.reply({ content: `Loop set to ${mode}.`, flags: MessageFlags.Ephemeral })
        return
      }
      case 'volume': {
        const percent = interaction.options.getInteger('percent', true)
        player.setVolume(percent, requester)
        await interaction.reply({ content: `Volume set to ${percent}%.`, flags: MessageFlags.Ephemeral })
        return
      }
      case 'remove': {
        const position = interaction.options.getInteger('position', true)
        player.removeTrack(position - 1, requester)
        await interaction.reply({
          content: `Removed track ${position}.`,
          flags: MessageFlags.Ephemeral
        })
        return
      }
      case 'queue': {
        const state = player.getState()
        const lines = state.queue.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`)
        const parts = [
          state.nowPlaying ? `**Now playing:** ${state.nowPlaying.title}` : 'Nothing is playing.',
          lines.length ? `\n**Up next:**\n${lines.join('\n')}` : '',
          state.queue.length > 10 ? `\n…and ${state.queue.length - 10} more` : ''
        ]
        await interaction.reply({ content: parts.join('') })
        return
      }
      case 'nowplaying': {
        const np = player.getState().nowPlaying
        await interaction.reply({
          content: np ? `**Now playing:** ${np.title}` : 'Nothing is playing.'
        })
        return
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('Slash command failed:', command, message)
    addAudit({ guildId, actor: requester, action: 'error', detail: `${command}: ${message}` })
    const reply = { content: 'Something went wrong handling that command.' }
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply).catch(() => {})
    } else {
      await interaction
        .reply({ ...reply, flags: MessageFlags.Ephemeral })
        .catch(() => {})
    }
  }
}
