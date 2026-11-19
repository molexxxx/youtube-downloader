import * as fs from 'fs'
import * as path from 'path'
import Module, { createRequire } from 'module'
import { logger } from '../logger'

const PACKAGE = '@discordjs/opus'

/** What loading the native Opus encoder found. */
export interface NativeOpusStatus {
  loaded: boolean
  version: string | null
  /** Where the binary came from when loaded, otherwise why it did not load. */
  detail: string
}

export interface NativeOpusOptions {
  require?: NodeRequire
  platform?: NodeJS.Platform
  arch?: string
}

function messageOf(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]
}

/** The entries of `dir`, or none when it cannot be read. */
function listFolders(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function register(req: NodeRequire, entry: string, binding: unknown): void {
  const mod = new Module(entry)
  mod.filename = entry
  mod.exports = binding
  mod.loaded = true
  req.cache[entry] = mod as unknown as NodeJS.Module
}

/**
 * Makes `require('@discordjs/opus')` return the native encoder inside Electron. The package finds its binary through
 * node-pre-gyp, whose folder name includes the runtime ABI and, on Linux, the glibc version, so under Electron it
 * looks for an `electron-vX.Y` build that is never published or built (@electron/rebuild leaves N-API modules
 * alone), and on Linux for the user's own glibc version. Its builds are N-API, which any runtime can load, so when the
 * package's own lookup fails this loads the build shipped for this platform and architecture and registers it in the
 * module cache under the package entry, where prism-media's `require` finds it. Never throws.
 */
export function loadNativeOpus(options: NativeOpusOptions = {}): NativeOpusStatus {
  const req = options.require ?? createRequire(__filename)
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch

  let entry: string
  let version: string | null
  try {
    entry = req.resolve(PACKAGE)
    version = (req(`${PACKAGE}/package.json`) as { version?: string }).version ?? null
  } catch {
    return { loaded: false, version: null, detail: `${PACKAGE} is not installed` }
  }

  let failure: unknown
  try {
    req(PACKAGE)
    return { loaded: true, version, detail: 'package lookup' }
  } catch (err) {
    failure = err
  }

  const root = path.join(path.dirname(entry), '..', 'prebuild')
  const marker = `-${platform}-${arch}-`
  const candidates = listFolders(root)
    .filter((name) => /-napi-v\d+-/.test(name) && name.includes(marker))
    .sort()
  if (candidates.length === 0) {
    return {
      loaded: false,
      version,
      detail: `no N-API build for ${platform}-${arch} (${messageOf(failure)})`
    }
  }
  for (const folder of candidates) {
    const file = path.join(root, folder, 'opus.node')
    try {
      const binding = req(file) as { OpusEncoder?: unknown }
      if (typeof binding?.OpusEncoder !== 'function') {
        failure = new Error(`${folder} has no OpusEncoder`)
        continue
      }
      register(req, entry, binding)
      return { loaded: true, version, detail: folder }
    } catch (err) {
      failure = new Error(`${folder}: ${messageOf(err)}`)
    }
  }
  return { loaded: false, version, detail: messageOf(failure) }
}

interface PrismOpus {
  opus: {
    Encoder: (new (options: { rate: number; channels: number; frameSize: number }) => {
      destroy(): void
    }) & { type?: string }
  }
}

/**
 * Encodes and decodes one 20 ms stereo frame of silence with the native encoder, then checks that prism-media, which
 * @discordjs/voice encodes playback with, picked the native module too. Returns null when both hold, otherwise the
 * failure.
 */
export function nativeOpusSelfTest(
  req: NodeRequire = createRequire(__filename)
): string | null {
  const frameBytes = 960 * 2 * 2
  try {
    const { OpusEncoder } = req(PACKAGE) as {
      OpusEncoder: new (
        rate: number,
        channels: number
      ) => {
        encode(pcm: Buffer): Buffer
        decode(packet: Buffer): Buffer
      }
    }
    const encoder = new OpusEncoder(48000, 2)
    const decoded = encoder.decode(encoder.encode(Buffer.alloc(frameBytes)))
    if (decoded.length !== frameBytes) {
      return `decoded ${decoded.length} bytes, expected ${frameBytes}`
    }
    const prism = createRequire(req.resolve('@discordjs/voice'))(
      'prism-media'
    ) as PrismOpus
    new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 }).destroy()
    const backend = prism.opus.Encoder.type
    return backend === PACKAGE ? null : `prism-media encodes with ${backend ?? 'nothing'}`
  } catch (err) {
    return messageOf(err)
  }
}

let status: NativeOpusStatus | null = null

/** Loads the native encoder once and logs which Opus backend voice playback uses. */
export function ensureNativeOpus(): NativeOpusStatus {
  if (status) return status
  status = loadNativeOpus()
  if (status.loaded) {
    logger.info(`Discord voice: native Opus ${status.version ?? ''} (${status.detail})`)
  } else {
    logger.warn(
      `Discord voice: native Opus unavailable, using opusscript (${status.detail})`
    )
  }
  return status
}
