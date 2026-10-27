/**
 * The FFmpeg builds this app version pins (pinned-builds.json, maintained by scripts/update-ffmpeg-pin.mjs): reading
 * and checking the pin, choosing what to install, and naming install folders.
 */

/** One pinned download: an archive holding ffmpeg, ffprobe, or both, with the size and digest it must match. */
export interface Asset {
  /** The install folder name of the build this asset belongs to, such as btbn-n9.0.2-17-g2a571b6068. */
  build: string
  url: string
  bytes: number
  sha256: string
  kind: 'zip' | 'tar.xz'
  contains: ReadonlyArray<'ffmpeg' | 'ffprobe'>
}

/** The assets of one platform key: every primary asset forms one build, every fallback asset another. */
export interface PlatformPin {
  /** The FFmpeg release both builds carry: the platform's own version when the pin holds it at another release, else the pin's. */
  version: string
  primary: Asset[]
  fallback: Asset[]
}

/** The contents of pinned-builds.json. */
export interface PinnedBuilds {
  id: string
  /** The FFmpeg release of every platform that names no version of its own. */
  version: string
  fetched: string
  platforms: Readonly<Record<string, PlatformPin>>
}

/** What an install does next. */
export type InstallPlan =
  | { kind: 'reuse'; folder: string }
  | { kind: 'download'; assets: Asset[]; source: 'primary' | 'fallback' }
  | { kind: 'unavailable' }

const PIN_ID =
  /^(?:btbn-n(\d+(?:\.\d+)+)-\d+-g[0-9a-f]+|gyan-(\d+(?:\.\d+)+)-full|mriedl-(\d+(?:\.\d+)+))$/
const PARTIAL_SUFFIX = /\.part-[A-Za-z0-9]+$/
const SHA256 = /^[0-9a-f]{64}$/
const GONE: ReadonlySet<number> = new Set([404, 410])

const PUBLISHERS: ReadonlyArray<{ prefix: string; name: string }> = [
  { prefix: 'btbn-', name: 'BtbN FFmpeg Builds' },
  { prefix: 'gyan-', name: 'Gyan.dev' },
  { prefix: 'mriedl-', name: 'Martin Riedl' }
]

/** True for an install folder name the app creates: btbn-n<version>-<n>-g<hash>, gyan-<version>-full, or mriedl-<version>. */
export function isPinId(name: string): boolean {
  return PIN_ID.test(name)
}

/** The FFmpeg release an install folder name carries, such as 9.0.2 for btbn-n9.0.2-17-g2a571b6068, or null for any other name. */
export function buildVersion(name: string): string | null {
  const m = PIN_ID.exec(name)
  return m ? (m[1] ?? m[2] ?? m[3]) : null
}

/** The publisher of an install folder name, or null for a name no pinned publisher uses. */
export function publisherOf(buildId: string): string | null {
  return PUBLISHERS.find((entry) => buildId.startsWith(entry.prefix))?.name ?? null
}

/** The pin key of a host, such as win32-x64. */
export function pinKey(platform: NodeJS.Platform, arch: string): string {
  return `${platform}-${arch}`
}

function readAsset(value: unknown, where: string): Asset {
  const a = (value ?? {}) as Record<string, unknown>
  const contains = Array.isArray(a.contains) ? a.contains : []
  const valid =
    typeof a.build === 'string' &&
    isPinId(a.build) &&
    typeof a.url === 'string' &&
    a.url.startsWith('https://') &&
    typeof a.bytes === 'number' &&
    Number.isSafeInteger(a.bytes) &&
    a.bytes > 0 &&
    typeof a.sha256 === 'string' &&
    SHA256.test(a.sha256) &&
    (a.kind === 'zip' || a.kind === 'tar.xz') &&
    contains.length > 0 &&
    contains.every((c) => c === 'ffmpeg' || c === 'ffprobe')
  if (!valid) throw new Error(`Invalid pinned asset at ${where}`)
  return {
    build: a.build as string,
    url: a.url as string,
    bytes: a.bytes as number,
    sha256: a.sha256 as string,
    kind: a.kind as Asset['kind'],
    contains: contains as Asset['contains']
  }
}

function readAssetSet(value: unknown, where: string): Asset[] {
  if (!Array.isArray(value)) throw new Error(`Invalid pinned asset list at ${where}`)
  const assets = value.map((v, i) => readAsset(v, `${where}[${i}]`))
  const builds = new Set(assets.map((a) => a.build))
  const covered = new Set(assets.flatMap((a) => a.contains))
  if (
    assets.length > 0 &&
    (builds.size !== 1 || !covered.has('ffmpeg') || !covered.has('ffprobe'))
  ) {
    throw new Error(
      `Pinned assets at ${where} must form one build holding ffmpeg and ffprobe`
    )
  }
  return assets
}

/**
 * Checks the shape of pinned-builds.json and returns it typed; throws on anything the installer could misuse. A
 * platform may name its own version; every build of a platform must carry that platform's version.
 */
export function parsePin(value: unknown): PinnedBuilds {
  const pin = (value ?? {}) as Record<string, unknown>
  if (
    typeof pin.id !== 'string' ||
    typeof pin.version !== 'string' ||
    typeof pin.fetched !== 'string' ||
    !pin.platforms ||
    typeof pin.platforms !== 'object'
  ) {
    throw new Error('Invalid pinned build list')
  }
  const platforms: Record<string, PlatformPin> = {}
  for (const [key, entry] of Object.entries(pin.platforms as Record<string, unknown>)) {
    const e = (entry ?? {}) as Record<string, unknown>
    if (e.version !== undefined && typeof e.version !== 'string') {
      throw new Error(`Invalid pinned version at ${key}`)
    }
    const version = (e.version as string | undefined) ?? pin.version
    const primary = readAssetSet(e.primary, `${key}.primary`)
    const fallback = readAssetSet(e.fallback, `${key}.fallback`)
    for (const assets of [primary, fallback]) {
      if (assets.length > 0 && buildVersion(assets[0].build) !== version) {
        throw new Error(
          `Pinned build ${assets[0].build} at ${key} is not FFmpeg ${version}`
        )
      }
    }
    platforms[key] = { version, primary, fallback }
  }
  return { id: pin.id, version: pin.version, fetched: pin.fetched, platforms }
}

/** The install folder names of a platform's pinned builds, primary first; empty when the pin has none for it. */
export function pinnedFolders(pin: PinnedBuilds, platformKey: string): string[] {
  const entry = pin.platforms[platformKey]
  if (!entry) return []
  return [entry.primary[0]?.build, entry.fallback[0]?.build].filter(
    (b): b is string => typeof b === 'string'
  )
}

function isGone(
  assets: readonly Asset[],
  failures: ReadonlyArray<{ url: string; status: number }>
): boolean {
  return assets.some((a) => failures.some((f) => f.url === a.url && GONE.has(f.status)))
}

/**
 * Decides the next install step: reuse an installed folder of this pin, download the primary build, fall back after
 * the primary answered 404 or 410, or report that neither can be fetched or the pin has no build for the platform.
 */
export function planInstall(
  pin: PinnedBuilds,
  platformKey: string,
  existingFolders: readonly string[],
  failures: ReadonlyArray<{ url: string; status: number }>
): InstallPlan {
  const entry = pin.platforms[platformKey]
  if (!entry) return { kind: 'unavailable' }
  for (const folder of pinnedFolders(pin, platformKey)) {
    if (existingFolders.includes(folder)) return { kind: 'reuse', folder }
  }
  if (entry.primary.length > 0 && !isGone(entry.primary, failures)) {
    return { kind: 'download', assets: [...entry.primary], source: 'primary' }
  }
  if (entry.fallback.length > 0 && !isGone(entry.fallback, failures)) {
    return { kind: 'download', assets: [...entry.fallback], source: 'fallback' }
  }
  return { kind: 'unavailable' }
}

/**
 * The entries of the FFmpeg root to delete once `keep` is installed: other pinned build folders, and staging folders
 * (`<build id>.part-<random>`) an interrupted install left. Anything else stays.
 */
export function foldersToDelete(
  keep: readonly string[],
  entries: readonly string[]
): string[] {
  return entries.filter(
    (name) =>
      !keep.includes(name) &&
      (isPinId(name) ||
        (PARTIAL_SUFFIX.test(name) && isPinId(name.replace(PARTIAL_SUFFIX, ''))))
  )
}

/** The executable file name of a tool on a platform. */
export function executableName(
  base: 'ffmpeg' | 'ffprobe',
  platform: NodeJS.Platform
): string {
  return platform === 'win32' ? `${base}.exe` : base
}
