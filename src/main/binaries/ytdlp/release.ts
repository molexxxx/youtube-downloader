/**
 * What a yt-dlp stable release offers this computer and how its files are fetched: the standalone build's asset
 * name, version parsing and ordering, the latest release (from the GitHub API, or the releases/latest redirect when
 * the API refuses), and the release's SHA2-256SUMS once its signature checks out.
 */
import type { YtdlpProblem } from '@shared/types'
import { HttpStatusError, RefusedUrlError, TooLargeError, type Http } from '../net'
import type { SignatureCheck } from './signature'

/** The repository of yt-dlp's stable channel. */
export const YTDLP_REPOSITORY = 'yt-dlp/yt-dlp'

const API_LATEST = `https://api.github.com/repos/${YTDLP_REPOSITORY}/releases/latest`
const WEB_LATEST = `https://github.com/${YTDLP_REPOSITORY}/releases/latest`

/** The checksum file every release carries, and its detached signature. */
export const SUMS_FILE = 'SHA2-256SUMS'
export const SIGNATURE_FILE = 'SHA2-256SUMS.sig'

const MAX_API_BYTES = 4 * 1024 * 1024
const MAX_SUMS_BYTES = 64 * 1024
const MAX_SIGNATURE_BYTES = 16 * 1024

/** A failure the updater reports with its problem kind. */
export class YtdlpUpdateError extends Error {
  constructor(
    readonly problem: YtdlpProblem,
    message: string
  ) {
    super(message)
    this.name = 'YtdlpUpdateError'
  }
}

/**
 * The standalone release asset for a platform and architecture, as listed in the README's release files, or null
 * when yt-dlp publishes none for it. These builds bundle their own Python, so nothing else has to be installed.
 */
export function assetFor(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === 'win32') {
    return (
      (
        {
          x64: 'yt-dlp.exe',
          arm64: 'yt-dlp_arm64.exe',
          ia32: 'yt-dlp_x86.exe'
        } as Record<string, string>
      )[arch] ?? null
    )
  }
  if (platform === 'darwin') {
    return 'yt-dlp_macos'
  }
  if (platform === 'linux') {
    return (
      ({ x64: 'yt-dlp_linux', arm64: 'yt-dlp_linux_aarch64' } as Record<string, string>)[
        arch
      ] ?? null
    )
  }
  return null
}

/** The installed file's name. */
export function executableName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
}

const VERSION_RE = /^\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d+)?$/

/** The version on the first line of `yt-dlp --version`, or a release tag, when it reads as one. */
export function parseVersion(text: string): string | null {
  const first = text.trim().split(/\r?\n/)[0]?.trim() ?? ''
  return VERSION_RE.test(first) ? first : null
}

/** Orders two yt-dlp versions by their dotted numbers; a nightly's extra part sorts after its date. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) {
      return Math.sign(diff)
    }
  }
  return 0
}

/** The SHA-256 a GNU-style sums file lists for exactly `name`, in lowercase hex. */
export function checksumFor(sums: string, name: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim())
    if (match && match[2] === name) {
      return match[1].toLowerCase()
    }
  }
  return null
}

/** Where a release file downloads from. */
export function releaseFileUrl(version: string, name: string): string {
  return `https://github.com/${YTDLP_REPOSITORY}/releases/download/${version}/${name}`
}

/** The newest stable release and the size of this computer's asset in it, when the API told it. */
export interface LatestRelease {
  version: string
  bytes: number | null
}

function readApiRelease(json: unknown, asset: string | null): LatestRelease | null {
  if (typeof json !== 'object' || json === null) {
    return null
  }
  const { tag_name: tag, assets } = json as { tag_name?: unknown; assets?: unknown }
  const version = typeof tag === 'string' ? parseVersion(tag) : null
  if (version === null) {
    return null
  }
  const entry = Array.isArray(assets)
    ? (assets as { name?: unknown; size?: unknown }[]).find((a) => a && a.name === asset)
    : undefined
  const bytes =
    typeof entry?.size === 'number' && Number.isFinite(entry.size) ? entry.size : null
  return { version, bytes }
}

function isRefusal(err: unknown): boolean {
  return err instanceof HttpStatusError && (err.status === 403 || err.status === 429)
}

const OFFLINE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
  'EPIPE'
])

const DISK_CODES = new Set([
  'ENOSPC',
  'EACCES',
  'EPERM',
  'EROFS',
  'EBUSY',
  'EEXIST',
  'ENOENT',
  'EISDIR',
  'EMFILE',
  'EDQUOT'
])

function codeOf(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}

/** The problem a failure reads as: its own kind, an HTTP answer, a network code, or a file system code. */
export function problemOf(err: unknown): YtdlpProblem {
  if (err instanceof YtdlpUpdateError) {
    return err.problem
  }
  if (err instanceof HttpStatusError) {
    return isRefusal(err) ? 'rate-limited' : 'server'
  }
  if (
    err instanceof TooLargeError ||
    err instanceof RefusedUrlError ||
    err instanceof SyntaxError
  ) {
    return 'server'
  }
  const code = codeOf(err)
  if (code !== null && OFFLINE_CODES.has(code)) {
    return 'offline'
  }
  if (code !== null && DISK_CODES.has(code)) {
    return 'disk'
  }
  return 'unknown'
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * The latest stable release. The GitHub API also gives the asset's size; when it refuses (its unauthenticated limit
 * is per network) or fails, the tag comes from where releases/latest redirects instead.
 */
export async function queryLatest(
  http: Http,
  asset: string | null
): Promise<LatestRelease> {
  let apiError: unknown
  try {
    const release = readApiRelease(await http.getJson(API_LATEST, MAX_API_BYTES), asset)
    if (release) {
      return release
    }
    apiError = new YtdlpUpdateError(
      'server',
      'The GitHub API answered without a release tag'
    )
  } catch (err) {
    apiError = err
  }
  try {
    const target = await http.redirectTarget(WEB_LATEST)
    const tag =
      target === null
        ? null
        : (/\/releases\/tag\/([^/?#]+)$/.exec(new URL(target).pathname)?.[1] ?? null)
    const version = tag === null ? null : parseVersion(decodeURIComponent(tag))
    if (version !== null) {
      return { version, bytes: null }
    }
  } catch {
    // The API's failure says more than the fallback's.
  }
  throw new YtdlpUpdateError(
    problemOf(apiError),
    `Could not look up the latest yt-dlp release: ${messageOf(apiError)}`
  )
}

/**
 * The text of a release's SHA2-256SUMS after `verifySignature` accepts its detached signature, so a checksum is only
 * ever trusted when the yt-dlp signing key vouches for it.
 */
export async function fetchSignedSums(
  http: Http,
  version: string,
  verifySignature: (data: Buffer, signature: Buffer) => SignatureCheck
): Promise<string> {
  let sums: Buffer
  let signature: Buffer
  try {
    ;[sums, signature] = await Promise.all([
      http.getBuffer(releaseFileUrl(version, SUMS_FILE), MAX_SUMS_BYTES),
      http.getBuffer(releaseFileUrl(version, SIGNATURE_FILE), MAX_SIGNATURE_BYTES)
    ])
  } catch (err) {
    throw new YtdlpUpdateError(
      problemOf(err),
      `Could not fetch the checksums of yt-dlp ${version}: ${messageOf(err)}`
    )
  }
  const check = verifySignature(sums, signature)
  if (!check.ok) {
    throw new YtdlpUpdateError(
      'signature',
      `The checksums of yt-dlp ${version} failed their signature check: ${check.reason}`
    )
  }
  return sums.toString('utf8')
}
