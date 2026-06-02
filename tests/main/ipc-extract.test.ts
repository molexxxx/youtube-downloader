import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const { handlers, getInfoMock, searchMock, getPlaylistPageMock, loggerMock } = vi.hoisted(
  () => ({
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    getInfoMock: vi.fn(),
    searchMock: vi.fn(),
    getPlaylistPageMock: vi.fn(),
    loggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
  })
)

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }
  }
}))
vi.mock('@main/ytdlp/resolver', () => ({
  getInfo: getInfoMock,
  search: searchMock,
  getPlaylistPage: getPlaylistPageMock
}))
vi.mock('@main/logger', () => ({ logger: loggerMock }))

import { registerExtractIPC } from '@main/ipc/extract'

beforeEach(() => {
  handlers.clear()
  getInfoMock.mockReset()
  searchMock.mockReset()
  getPlaylistPageMock.mockReset()
  loggerMock.error.mockReset()
  registerExtractIPC()
})

describe('registerExtractIPC', () => {
  it('registers info, search, and playlistPage handlers', () => {
    expect(handlers.has(IPC.extract.info)).toBe(true)
    expect(handlers.has(IPC.extract.search)).toBe(true)
    expect(handlers.has(IPC.extract.playlistPage)).toBe(true)
  })

  it('info returns resolver metadata', async () => {
    getInfoMock.mockResolvedValue({ id: 'abc', title: 'Clip' })
    const result = await handlers.get(IPC.extract.info)!({}, 'https://x')
    expect(getInfoMock).toHaveBeenCalledWith('https://x', undefined)
    expect(result).toEqual({ id: 'abc', title: 'Clip' })
  })

  it('info forwards the forcePlaylist flag', async () => {
    getInfoMock.mockResolvedValue({ id: 'abc', title: 'Playlist' })
    await handlers.get(IPC.extract.info)!({}, 'https://x', true)
    expect(getInfoMock).toHaveBeenCalledWith('https://x', true)
  })

  it('info logs and rethrows a cleaned error', async () => {
    getInfoMock.mockRejectedValue(new Error('ERROR: [youtube] boom'))
    await expect(handlers.get(IPC.extract.info)!({}, 'https://x')).rejects.toThrow('boom')
    expect(loggerMock.error).toHaveBeenCalled()
  })

  it('search forwards the query and limit', async () => {
    searchMock.mockResolvedValue([{ id: '1' }])
    const result = await handlers.get(IPC.extract.search)!({}, 'cats', 5)
    expect(searchMock).toHaveBeenCalledWith('cats', 5)
    expect(result).toEqual([{ id: '1' }])
  })

  it('search logs and rethrows a cleaned error', async () => {
    searchMock.mockRejectedValue(new Error('ERROR: nope'))
    await expect(handlers.get(IPC.extract.search)!({}, 'cats')).rejects.toThrow('nope')
    expect(loggerMock.error).toHaveBeenCalled()
  })

  it('playlistPage forwards the url and 1-based range', async () => {
    getPlaylistPageMock.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    const result = await handlers.get(IPC.extract.playlistPage)!({}, 'https://x', 201, 400)
    expect(getPlaylistPageMock).toHaveBeenCalledWith('https://x', 201, 400)
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('playlistPage logs and rethrows a cleaned error', async () => {
    getPlaylistPageMock.mockRejectedValue(new Error('ERROR: boom'))
    await expect(
      handlers.get(IPC.extract.playlistPage)!({}, 'https://x', 1, 200)
    ).rejects.toThrow('boom')
    expect(loggerMock.error).toHaveBeenCalled()
  })
})
