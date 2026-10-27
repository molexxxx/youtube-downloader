/**
 * The yt-dlp HTTPS transport over a fake `https.get`: GitHub hosts only, redirects followed to a limit, sizes
 * capped before and while reading, stalls reported as timeouts, and downloads hashed while they stream to disk.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { IncomingMessage } from 'http'
import {
  createHttp,
  isFfmpegSourceUrl,
  isGithubUrl,
  HttpStatusError,
  RefusedUrlError,
  STALL_MS,
  TooLargeError,
  type HttpsGet
} from '@main/binaries/net'

interface Route {
  status?: number
  headers?: Record<string, string>
  body?: Buffer[]
  error?: Error
  hang?: boolean
}

interface FakeRequest extends EventEmitter {
  timeoutMs?: number
  onTimeout?: () => void
}

function fakeGet(routes: Record<string, Route>): {
  get: HttpsGet
  requests: FakeRequest[]
  urls: string[]
} {
  const requests: FakeRequest[] = []
  const urls: string[] = []
  const get = ((
    url: string,
    _options: unknown,
    callback: (res: IncomingMessage) => void
  ) => {
    const req = new EventEmitter() as FakeRequest & {
      setTimeout: (ms: number, fn: () => void) => void
      destroy: (err?: Error) => void
    }
    req.setTimeout = (ms, fn) => {
      req.timeoutMs = ms
      req.onTimeout = fn
    }
    req.destroy = (err) => {
      if (err) {
        req.emit('error', err)
      }
    }
    requests.push(req)
    urls.push(url)
    queueMicrotask(() => {
      const route = routes[url]
      if (!route) {
        req.emit(
          'error',
          Object.assign(new Error(`getaddrinfo ENOTFOUND ${url}`), { code: 'ENOTFOUND' })
        )
        return
      }
      if (route.error) {
        req.emit('error', route.error)
        return
      }
      if (route.hang) {
        return
      }
      const res = Readable.from(route.body ?? []) as unknown as IncomingMessage
      res.statusCode = route.status ?? 200
      res.headers = route.headers ?? {}
      callback(res)
    })
    return req
  }) as unknown as HttpsGet
  return { get, requests, urls }
}

const API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
const ASSET = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe'
const CDN = 'https://release-assets.githubusercontent.com/asset/1'

describe('isGithubUrl', () => {
  it('allows HTTPS on GitHub and its asset hosts only', () => {
    expect(isGithubUrl(API)).toBe(true)
    expect(isGithubUrl(ASSET)).toBe(true)
    expect(isGithubUrl(CDN)).toBe(true)
    expect(isGithubUrl('http://github.com/yt-dlp')).toBe(false)
    expect(isGithubUrl('https://github.com.evil.example/x')).toBe(false)
    expect(isGithubUrl('https://githubusercontent.com.example/x')).toBe(false)
    expect(isGithubUrl('not a url')).toBe(false)
  })
})

describe('isFfmpegSourceUrl', () => {
  it('allows GitHub and Martin Riedl over HTTPS, and nothing else', () => {
    expect(isFfmpegSourceUrl(ASSET)).toBe(true)
    expect(isFfmpegSourceUrl(CDN)).toBe(true)
    expect(
      isFfmpegSourceUrl(
        'https://ffmpeg.martin-riedl.de/download/macos/arm64/1_9.0.2/ffmpeg.zip'
      )
    ).toBe(true)
    expect(isFfmpegSourceUrl('http://ffmpeg.martin-riedl.de/download/x.zip')).toBe(false)
    expect(isFfmpegSourceUrl('https://evermeet.cx/ffmpeg/getrelease/zip')).toBe(false)
    expect(isFfmpegSourceUrl('https://martin-riedl.de.evil.example/x')).toBe(false)
  })
})

describe('createHttp', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-net-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads JSON through a relative redirect and sets a stall timeout', async () => {
    const fake = fakeGet({
      [API]: { status: 302, headers: { location: '/repos/yt-dlp/yt-dlp/releases/1' } },
      'https://api.github.com/repos/yt-dlp/yt-dlp/releases/1': {
        body: [Buffer.from('{"tag_name":'), Buffer.from('"2026.08.19"}')]
      }
    })
    const http = createHttp(isGithubUrl, fake.get)
    await expect(http.getJson(API, 1024)).resolves.toEqual({ tag_name: '2026.08.19' })
    expect(fake.urls).toEqual([
      API,
      'https://api.github.com/repos/yt-dlp/yt-dlp/releases/1'
    ])
    expect(fake.requests[0].timeoutMs).toBe(STALL_MS)
  })

  it('reports statuses, refused hosts, and redirect loops', async () => {
    const loop = 'https://github.com/loop'
    const fake = fakeGet({
      [API]: { status: 403 },
      [loop]: { status: 301, headers: { location: loop } },
      [ASSET]: { status: 302, headers: { location: 'http://example.com/yt-dlp.exe' } }
    })
    const http = createHttp(isGithubUrl, fake.get)
    const status = await http.getBuffer(API, 10).catch((err) => err)
    expect(status).toBeInstanceOf(HttpStatusError)
    expect(status.status).toBe(403)
    await expect(http.getBuffer(loop, 10)).rejects.toThrow('redirected too many times')
    await expect(http.getBuffer(ASSET, 10)).rejects.toBeInstanceOf(RefusedUrlError)
    await expect(http.getBuffer('https://example.com/x', 10)).rejects.toBeInstanceOf(
      RefusedUrlError
    )
  })

  it('caps a body by its declared length and while it streams', async () => {
    const fake = fakeGet({
      [API]: { headers: { 'content-length': '100' }, body: [Buffer.alloc(100)] },
      [CDN]: { body: [Buffer.alloc(6), Buffer.alloc(6)] }
    })
    const http = createHttp(isGithubUrl, fake.get)
    await expect(http.getBuffer(API, 50)).rejects.toBeInstanceOf(TooLargeError)
    await expect(http.getBuffer(CDN, 10)).rejects.toBeInstanceOf(TooLargeError)
    await expect(http.getBuffer(CDN, 12)).resolves.toHaveLength(12)
  })

  it('passes connection errors through and reports a stall as a timeout', async () => {
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    const fake = fakeGet({ [API]: { error: reset }, [CDN]: { hang: true } })
    const http = createHttp(isGithubUrl, fake.get)
    await expect(http.getBuffer(API, 10)).rejects.toBe(reset)
    const pending = http.getBuffer(CDN, 10)
    await new Promise((resolve) => setImmediate(resolve))
    fake.requests[1].onTimeout!()
    await expect(pending).rejects.toMatchObject({ code: 'ETIMEDOUT' })
  })

  it('answers where a URL redirects without following it', async () => {
    const latest = 'https://github.com/yt-dlp/yt-dlp/releases/latest'
    const fake = fakeGet({
      [latest]: {
        status: 302,
        headers: { location: '/yt-dlp/yt-dlp/releases/tag/2026.08.19' }
      },
      [API]: { status: 200, body: [Buffer.from('ok')] },
      [CDN]: { status: 404 }
    })
    const http = createHttp(isGithubUrl, fake.get)
    await expect(http.redirectTarget(latest)).resolves.toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19'
    )
    expect(fake.urls).toEqual([latest])
    await expect(http.redirectTarget(API)).resolves.toBeNull()
    await expect(http.redirectTarget(CDN)).rejects.toBeInstanceOf(HttpStatusError)
  })

  it('streams a download to a new file with its size, SHA-256, and progress', async () => {
    const parts = [Buffer.alloc(2 * 1024 * 1024, 7), Buffer.from('tail')]
    const whole = Buffer.concat(parts)
    const fake = fakeGet({
      [ASSET]: { status: 302, headers: { location: CDN } },
      [CDN]: { headers: { 'content-length': String(whole.length) }, body: parts }
    })
    const http = createHttp(isGithubUrl, fake.get)
    const file = path.join(dir, 'yt-dlp.exe')
    const progress: Array<[number, number | null]> = []
    const got = await http.download(ASSET, file, {
      maxBytes: whole.length,
      onProgress: (received, total) => progress.push([received, total])
    })
    expect(got).toEqual({
      bytes: whole.length,
      sha256: createHash('sha256').update(whole).digest('hex')
    })
    expect(fs.readFileSync(file).equals(whole)).toBe(true)
    expect(progress).toEqual([
      [parts[0].length, whole.length],
      [whole.length, whole.length]
    ])
  })

  it('stops a download that is too large, fails to write, or answers an error', async () => {
    const fake = fakeGet({
      [ASSET]: { headers: { 'content-length': '1000' }, body: [Buffer.alloc(1000)] },
      [CDN]: { body: [Buffer.alloc(8), Buffer.alloc(8)] },
      'https://github.com/missing': { status: 404 }
    })
    const http = createHttp(isGithubUrl, fake.get)
    const onProgress = vi.fn()
    await expect(
      http.download(ASSET, path.join(dir, 'a'), { maxBytes: 10, onProgress })
    ).rejects.toBeInstanceOf(TooLargeError)
    await expect(
      http.download(CDN, path.join(dir, 'b'), { maxBytes: 10, onProgress })
    ).rejects.toBeInstanceOf(TooLargeError)
    await expect(
      http.download('https://github.com/missing', path.join(dir, 'c'), {
        maxBytes: 10,
        onProgress
      })
    ).rejects.toBeInstanceOf(HttpStatusError)
    fs.writeFileSync(path.join(dir, 'taken'), 'x')
    await expect(
      http.download(CDN, path.join(dir, 'taken'), { maxBytes: 100, onProgress })
    ).rejects.toMatchObject({ code: 'EEXIST' })
    expect(fs.readFileSync(path.join(dir, 'taken'), 'utf8')).toBe('x')
  })
})
