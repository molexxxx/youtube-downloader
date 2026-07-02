import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

const { getMock, createWriteStreamMock, mkdirMock, appMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  createWriteStreamMock: vi.fn(),
  mkdirMock: vi.fn(() => Promise.resolve()),
  appMock: { getPath: vi.fn(() => '/userData') }
}))

vi.mock('electron', () => ({ app: appMock }))
vi.mock('fs', () => ({ createWriteStream: createWriteStreamMock }))
vi.mock('fs/promises', () => ({ mkdir: mkdirMock }))
vi.mock('https', () => ({ get: getMock }))

import { binDir, ensureBinDir, currentPlatform, downloadFile } from '@main/binaries/net'

function makeRequest(): EventEmitter & {
  setTimeout: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
} {
  const req = new EventEmitter() as EventEmitter & {
    setTimeout: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }
  req.setTimeout = vi.fn()
  req.destroy = vi.fn()
  return req
}

function makeResponse(
  statusCode: number,
  headers: Record<string, unknown> = {}
): EventEmitter & {
  statusCode: number
  headers: Record<string, unknown>
  resume: ReturnType<typeof vi.fn>
  pipe: ReturnType<typeof vi.fn>
} {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number
    headers: Record<string, unknown>
    resume: ReturnType<typeof vi.fn>
    pipe: ReturnType<typeof vi.fn>
  }
  res.statusCode = statusCode
  res.headers = headers
  res.resume = vi.fn()
  res.pipe = vi.fn()
  return res
}

function makeFile(): EventEmitter & { close: ReturnType<typeof vi.fn> } {
  const file = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> }
  file.close = vi.fn((cb: () => void) => cb())
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('binDir / ensureBinDir', () => {
  it('binDir joins userData with bin', () => {
    expect(binDir().replace(/\\/g, '/')).toBe('/userData/bin')
  })

  it('ensureBinDir creates the directory recursively', async () => {
    const dir = await ensureBinDir()
    expect(mkdirMock).toHaveBeenCalledWith(dir, { recursive: true })
    expect(dir.replace(/\\/g, '/')).toBe('/userData/bin')
  })
})

describe('currentPlatform', () => {
  it('returns the active platform when supported', () => {
    expect(['win32', 'darwin', 'linux']).toContain(currentPlatform())
  })

  it('throws on an unsupported platform', () => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'sunos', configurable: true })
    expect(() => currentPlatform()).toThrow(/Unsupported platform/)
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  })
})

describe('downloadFile', () => {
  it('downloads a 200 response and reports progress', async () => {
    const req = makeRequest()
    const res = makeResponse(200, { 'content-length': '4' })
    const file = makeFile()
    createWriteStreamMock.mockReturnValue(file)
    getMock.mockImplementation((_url, _opts, cb: (r: unknown) => void) => {
      cb(res)
      return req
    })

    const progress = vi.fn()
    const promise = downloadFile('https://x/file', '/dest', progress)
    res.emit('data', Buffer.from('abcd'))
    file.emit('finish')

    await expect(promise).resolves.toBeUndefined()
    expect(progress).toHaveBeenCalledWith(4, 4)
    expect(res.pipe).toHaveBeenCalledWith(file)
  })

  it('follows redirects', async () => {
    const file = makeFile()
    createWriteStreamMock.mockReturnValue(file)
    let call = 0
    getMock.mockImplementation((_url, _opts, cb: (r: unknown) => void) => {
      const req = makeRequest()
      if (call++ === 0) {
        cb(makeResponse(302, { location: 'https://x/final' }))
      } else {
        const res = makeResponse(200, {})
        cb(res)
        queueMicrotask(() => file.emit('finish'))
      }
      return req
    })

    await expect(downloadFile('https://x/start', '/dest')).resolves.toBeUndefined()
    expect(getMock).toHaveBeenCalledTimes(2)
  })

  it('rejects on a non-200/3xx status', async () => {
    getMock.mockImplementation((_url, _opts, cb: (r: unknown) => void) => {
      cb(makeResponse(404, {}))
      return makeRequest()
    })
    await expect(downloadFile('https://x/missing', '/dest')).rejects.toThrow(
      /failed \(404\)/
    )
  })

  it('rejects after too many redirects', async () => {
    getMock.mockImplementation((_url, _opts, cb: (r: unknown) => void) => {
      cb(makeResponse(302, { location: 'https://x/loop' }))
      return makeRequest()
    })
    await expect(downloadFile('https://x/loop', '/dest')).rejects.toThrow(
      /Too many redirects/
    )
  })

  it('rejects on a request error', async () => {
    const req = makeRequest()
    getMock.mockImplementation(() => req)
    const promise = downloadFile('https://x/file', '/dest')
    req.emit('error', new Error('socket boom'))
    await expect(promise).rejects.toThrow('socket boom')
  })
})
