const urls = import.meta.glob<string>('./assets/shots/*.webp', {
  eager: true,
  import: 'default',
  query: '?url'
})

export type ShotName =
  | 'hero-dark'
  | 'playlist'
  | 'quality'
  | 'history'
  | 'discord'
  | 'effects'
  | 'mini-download'
  | 'mini-discord'
  | 'setup'

/** Every capture in page order, which is also the viewer's order. */
export const GALLERY: ShotName[] = [
  'hero-dark',
  'playlist',
  'quality',
  'history',
  'discord',
  'effects',
  'mini-download',
  'mini-discord',
  'setup'
]

/** CSS size of each capture; every capture also ships at twice this size. */
const SIZES: Record<ShotName, { width: number; height: number }> = {
  'hero-dark': { width: 1280, height: 800 },
  playlist: { width: 1280, height: 800 },
  quality: { width: 1280, height: 800 },
  history: { width: 1280, height: 800 },
  discord: { width: 1280, height: 800 },
  effects: { width: 578, height: 395 },
  'mini-download': { width: 380, height: 560 },
  'mini-discord': { width: 380, height: 560 },
  setup: { width: 1280, height: 800 }
}

/** What each capture shows; used as alt text on the page and as the viewer's caption. */
export const CAPTIONS: Record<ShotName, string> = {
  'hero-dark':
    'The Download tab: a resolved Big Buck Bunny video with six presets and a Download button, beside the Downloads panel with three downloads in progress, three queued, and three finished.',
  playlist:
    'A resolved playlist, Open Movie Night, with its videos selected and the presets beside them, next to the Downloads panel.',
  quality:
    'The six presets above an open format list showing 4K, 1440p, and 1080p choices with codec and size, next to the Downloads panel.',
  history:
    'Download history with play, folder, and Discord buttons for each finished file, next to the Downloads panel.',
  discord:
    'The Discord Bot tab: Caminandes 3 playing in the Theater voice channel with playback controls, beside an Up next queue of ten tracks.',
  effects:
    'The Audio effects panel with the Bass Boost preset: bass at +9 dB, treble at +2 dB, speed and pitch at 1.00x.',
  'mini-download':
    'Quick Actions on the Download tab: a link field, Video and Audio choices, and a Download button above three active downloads.',
  'mini-discord':
    'Quick Actions on the Discord tab: the server tiles, the track playing, playback controls, the Theater voice channel, and the Up next list.',
  setup:
    'The setup screen: the app’s own copies of yt-dlp and FFmpeg selected and marked Recommended, the option to use copies on this computer, and an Install and test button.'
}

export interface Shot {
  src: string
  srcSet: string
  width: number
  height: number
  /** The 2x file and its pixel width, for the full-quality viewer. */
  full: string
  fullWidth: number
}

function url(file: string): string {
  const found = urls[`./assets/shots/${file}.webp`]
  if (!found) throw new Error(`Missing capture ${file}`)
  return found
}

export function shot(name: ShotName): Shot {
  const { width, height } = SIZES[name]
  const small = url(`${name}-${width}`)
  const large = url(`${name}-${width * 2}`)
  return {
    src: small,
    srcSet: `${small} ${width}w, ${large} ${width * 2}w`,
    width,
    height,
    full: large,
    fullWidth: width * 2
  }
}
