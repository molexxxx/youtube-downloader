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
  | 'setup'
  | 'mini-download'
  | 'mini-discord'
  | 'effects'

/** CSS size of each capture; every capture also ships at twice this size. */
const SIZES: Record<ShotName, { width: number; height: number }> = {
  'hero-dark': { width: 1280, height: 800 },
  playlist: { width: 1280, height: 800 },
  quality: { width: 1280, height: 800 },
  history: { width: 1280, height: 800 },
  discord: { width: 1280, height: 800 },
  setup: { width: 1280, height: 800 },
  'mini-download': { width: 380, height: 560 },
  'mini-discord': { width: 380, height: 560 },
  effects: { width: 578, height: 395 }
}

export interface Shot {
  src: string
  srcSet: string
  width: number
  height: number
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
    height
  }
}
