import { EmbedBuilder } from 'discord.js'
import type { GuildPlayerState, Track, TrackInput } from '@shared/types'

const COLOR = 0x5865f2

function trunc(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Format seconds as m:ss / h:mm:ss; flat playlist items often lack a duration. */
export function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function nowPlayingEmbed(track: Track | null): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLOR).setAuthor({ name: 'Now Playing' })
  if (!track) return embed.setDescription('Nothing is playing.')
  return embed
    .setTitle(trunc(track.title, 250))
    .setURL(track.url)
    .setThumbnail(track.thumbnail)
    .addFields(
      { name: 'Artist', value: track.uploader ?? 'Unknown', inline: true },
      { name: 'Duration', value: fmtDuration(track.duration), inline: true },
      { name: 'Requested by', value: track.requestedBy.username, inline: true }
    )
}

export function queueEmbed(state: GuildPlayerState): EmbedBuilder {
  const upNext = state.queue
    .slice(0, 10)
    .map(
      (t, i) =>
        `\`${i + 1}.\` [${trunc(t.title, 60)}](${t.url}) \`${fmtDuration(t.duration)}\``
    )
  const parts = [
    state.nowPlaying
      ? `**Now Playing**\n[${trunc(state.nowPlaying.title, 60)}](${state.nowPlaying.url})\n`
      : '',
    upNext.length ? `**Up Next**\n${upNext.join('\n')}` : '_The queue is empty._',
    state.queue.length > 10 ? `\n…and ${state.queue.length - 10} more` : ''
  ]
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('Queue')
    .setDescription(parts.join('\n'))
    .setFooter({
      text: `${state.queue.length} in queue · loop: ${state.loop} · volume ${state.volume}%`
    })
}

export function addedEmbed(tracks: TrackInput[]): EmbedBuilder {
  if (tracks.length === 1) {
    const t = tracks[0]
    return new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor({ name: 'Added to Queue' })
      .setTitle(trunc(t.title, 250))
      .setURL(t.url)
      .setThumbnail(t.thumbnail)
      .addFields(
        { name: 'Artist', value: t.uploader ?? 'Unknown', inline: true },
        { name: 'Duration', value: fmtDuration(t.duration), inline: true }
      )
  }
  const list = tracks
    .slice(0, 8)
    .map((t, i) => `\`${i + 1}.\` [${trunc(t.title, 55)}](${t.url})`)
    .join('\n')
  return new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: `Added ${tracks.length} tracks to Queue` })
    .setDescription(list + (tracks.length > 8 ? `\n…and ${tracks.length - 8} more` : ''))
}

export function searchEmbed(query: string, results: TrackInput[]): EmbedBuilder {
  const lines = results.map(
    (t, i) =>
      `\`${i + 1}.\` [${trunc(t.title, 60)}](${t.url}) \`${fmtDuration(t.duration)}\`` +
      (t.uploader ? ` · ${trunc(t.uploader, 30)}` : '')
  )
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`Search results for "${trunc(query, 80)}"`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Pick a track from the menu below' })
}
