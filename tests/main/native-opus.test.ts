/**
 * Loading @discordjs/opus's N-API build when the package's own node-pre-gyp lookup misses it, as it does inside
 * Electron (an `electron-vX.Y` folder that is never built) and on Linux systems whose glibc version differs from the
 * build machine's.
 */
import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createRequire } from 'module'
import { loadNativeOpus } from '@main/discord/native-opus'

const nodeRequire = createRequire(import.meta.url)
const temps: string[] = []

/** Removes a temp folder. Windows keeps a loaded .node file locked until the process exits, so that one may stay. */
function removeTemp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EBUSY')) throw err
  }
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    removeTemp(dir)
  }
})

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-opus-'))
  temps.push(dir)
  return dir
}

/** A package folder with the given prebuild folders, each holding an (empty) opus.node. */
function opusPackage(folders: string[]): { entry: string; prebuild: string } {
  const root = path.join(tempDir(), 'node_modules', '@discordjs', 'opus')
  const prebuild = path.join(root, 'prebuild')
  for (const folder of folders) {
    fs.mkdirSync(path.join(prebuild, folder), { recursive: true })
    fs.writeFileSync(path.join(prebuild, folder, 'opus.node'), '')
  }
  return { entry: path.join(root, 'lib', 'index.js'), prebuild }
}

const missing = (id: string): Error =>
  Object.assign(new Error(`Cannot find module '${id}'`), { code: 'MODULE_NOT_FOUND' })

/** A `require` that serves `modules` by id or path, throws for anything else, and records what was asked for. */
function fakeRequire(
  entry: string | null,
  modules: Record<string, unknown>
): NodeRequire & { calls: string[] } {
  const calls: string[] = []
  const req = ((id: string) => {
    calls.push(id)
    if (!(id in modules)) throw missing(id)
    const hit = modules[id]
    if (hit instanceof Error) throw hit
    return hit
  }) as NodeRequire & { calls: string[] }
  req.resolve = ((id: string) => {
    if (id === '@discordjs/opus' && entry) return entry
    throw missing(id)
  }) as NodeRequire['resolve']
  req.cache = {}
  req.calls = calls
  return req
}

class OpusEncoder {}
const PKG = { version: '0.11.0' }
const ELECTRON_MISS = missing(
  '/app/node_modules/@discordjs/opus/prebuild/electron-v45.3-napi-v3/opus.node'
)

describe('loadNativeOpus', () => {
  it('uses the package lookup when it works and registers nothing', () => {
    const { entry } = opusPackage([])
    const req = fakeRequire(entry, {
      '@discordjs/opus/package.json': PKG,
      '@discordjs/opus': { OpusEncoder }
    })
    expect(loadNativeOpus({ require: req })).toEqual({
      loaded: true,
      version: '0.11.0',
      detail: 'package lookup'
    })
    expect(req.cache).toEqual({})
  })

  it('loads the N-API build for this platform and architecture and registers it under the package entry', () => {
    const { entry, prebuild } = opusPackage([
      'node-v127-napi-v3-win32-arm64-unknown-unknown',
      'node-v137-napi-v3-win32-x64-unknown-unknown',
      'node-v137-napi-v3-linux-x64-glibc-2.39',
      'node-v137-win32-x64-unknown-unknown'
    ])
    const binding = { OpusEncoder }
    const wanted = path.join(
      prebuild,
      'node-v137-napi-v3-win32-x64-unknown-unknown',
      'opus.node'
    )
    const req = fakeRequire(entry, {
      '@discordjs/opus/package.json': PKG,
      '@discordjs/opus': ELECTRON_MISS,
      [wanted]: binding
    })
    expect(loadNativeOpus({ require: req, platform: 'win32', arch: 'x64' })).toEqual({
      loaded: true,
      version: '0.11.0',
      detail: 'node-v137-napi-v3-win32-x64-unknown-unknown'
    })
    expect(req.cache[entry]?.exports).toBe(binding)
    expect(req.cache[entry]?.loaded).toBe(true)
    expect(req.calls.filter((id) => id.endsWith('opus.node'))).toEqual([wanted])
  })

  it('loads a Linux build whatever glibc version its folder names', () => {
    const { entry, prebuild } = opusPackage(['node-v127-napi-v3-linux-x64-glibc-2.39'])
    const wanted = path.join(
      prebuild,
      'node-v127-napi-v3-linux-x64-glibc-2.39',
      'opus.node'
    )
    const req = fakeRequire(entry, {
      '@discordjs/opus/package.json': PKG,
      '@discordjs/opus': missing(
        '/app/prebuild/electron-v45.3-napi-v3-linux-x64-glibc-2.35/opus.node'
      ),
      [wanted]: { OpusEncoder }
    })
    const status = loadNativeOpus({ require: req, platform: 'linux', arch: 'x64' })
    expect(status.loaded).toBe(true)
    expect(status.detail).toBe('node-v127-napi-v3-linux-x64-glibc-2.39')
  })

  it('moves on from a build that fails to load or has no encoder', () => {
    const { entry, prebuild } = opusPackage([
      'node-v115-napi-v3-darwin-arm64-unknown-unknown',
      'node-v127-napi-v3-darwin-arm64-unknown-unknown',
      'node-v137-napi-v3-darwin-arm64-unknown-unknown'
    ])
    const file = (folder: string): string => path.join(prebuild, folder, 'opus.node')
    const req = fakeRequire(entry, {
      '@discordjs/opus/package.json': PKG,
      '@discordjs/opus': ELECTRON_MISS,
      [file('node-v115-napi-v3-darwin-arm64-unknown-unknown')]: new Error(
        'dlopen: built for macOS 13.5 which is newer than running OS'
      ),
      [file('node-v127-napi-v3-darwin-arm64-unknown-unknown')]: {},
      [file('node-v137-napi-v3-darwin-arm64-unknown-unknown')]: { OpusEncoder }
    })
    const status = loadNativeOpus({ require: req, platform: 'darwin', arch: 'arm64' })
    expect(status).toEqual({
      loaded: true,
      version: '0.11.0',
      detail: 'node-v137-napi-v3-darwin-arm64-unknown-unknown'
    })
  })

  it('says why when no build loads, and registers nothing', () => {
    const { entry, prebuild } = opusPackage([
      'node-v127-napi-v3-darwin-arm64-unknown-unknown'
    ])
    const req = fakeRequire(entry, {
      '@discordjs/opus/package.json': PKG,
      '@discordjs/opus': ELECTRON_MISS,
      [path.join(
        prebuild,
        'node-v127-napi-v3-darwin-arm64-unknown-unknown',
        'opus.node'
      )]: new Error('dlopen: built for macOS 13.5 which is newer than running OS\nmore')
    })
    expect(loadNativeOpus({ require: req, platform: 'darwin', arch: 'arm64' })).toEqual({
      loaded: false,
      version: '0.11.0',
      detail:
        'node-v127-napi-v3-darwin-arm64-unknown-unknown: dlopen: built for macOS 13.5 which is newer than running OS'
    })
    expect(req.cache).toEqual({})
  })

  it('says when no build exists for this platform and architecture', () => {
    const { entry } = opusPackage(['node-v127-napi-v3-win32-x64-unknown-unknown'])
    const req = fakeRequire(entry, {
      '@discordjs/opus/package.json': PKG,
      '@discordjs/opus': ELECTRON_MISS
    })
    const status = loadNativeOpus({ require: req, platform: 'linux', arch: 'arm64' })
    expect(status.loaded).toBe(false)
    expect(status.detail).toMatch(/^no N-API build for linux-arm64 \(Cannot find module /)
  })

  it('says when the package is not installed', () => {
    expect(loadNativeOpus({ require: fakeRequire(null, {}) })).toEqual({
      loaded: false,
      version: null,
      detail: '@discordjs/opus is not installed'
    })
  })

  it('makes a real N-API build reachable through require when the package loader misses it', () => {
    const real = nodeRequire.resolve('@discordjs/opus/package.json')
    const realPrebuild = path.join(path.dirname(real), 'prebuild')
    const shipped = fs
      .readdirSync(realPrebuild)
      .find(
        (name) =>
          /-napi-v\d+-/.test(name) &&
          name.includes(`-${process.platform}-${process.arch}-`)
      )
    expect(shipped, 'npm install provides an N-API build for this machine').toBeDefined()

    const app = tempDir()
    const pkg = path.join(app, 'node_modules', '@discordjs', 'opus')
    const folder = `node-v1-napi-v3-${process.platform}-${process.arch}-test`
    fs.mkdirSync(path.join(pkg, 'lib'), { recursive: true })
    fs.mkdirSync(path.join(pkg, 'prebuild', folder), { recursive: true })
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: '@discordjs/opus', version: '9.9.9', main: 'lib/index.js' })
    )
    fs.writeFileSync(
      path.join(pkg, 'lib', 'index.js'),
      'throw new Error("Cannot find module \'prebuild/electron-v45.3-napi-v3/opus.node\'")'
    )
    fs.copyFileSync(
      path.join(realPrebuild, shipped as string, 'opus.node'),
      path.join(pkg, 'prebuild', folder, 'opus.node')
    )
    const appRequire = createRequire(path.join(app, 'main.js'))
    const entry = appRequire.resolve('@discordjs/opus')
    try {
      expect(loadNativeOpus({ require: appRequire })).toEqual({
        loaded: true,
        version: '9.9.9',
        detail: folder
      })

      const prismRequire = createRequire(
        path.join(app, 'node_modules', 'prism-media', 'index.js')
      )
      const { OpusEncoder: Native } = prismRequire('@discordjs/opus') as {
        OpusEncoder: new (
          rate: number,
          channels: number
        ) => {
          encode(pcm: Buffer): Buffer
          decode(packet: Buffer): Buffer
        }
      }
      const encoder = new Native(48000, 2)
      expect(encoder.decode(encoder.encode(Buffer.alloc(3840))).length).toBe(3840)
    } finally {
      delete appRequire.cache[entry]
    }
  })
})
