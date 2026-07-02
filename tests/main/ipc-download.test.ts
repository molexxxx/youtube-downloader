import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const { handlers, sentMessages, managerMock, windows } = vi.hoisted(() => {
  const sentMessages: Array<{ channel: string; payload: unknown }> = []
  const managerMock = {
    listeners: new Map<string, (...args: unknown[]) => void>(),
    on(event: string, fn: (...args: unknown[]) => void) {
      this.listeners.set(event, fn)
    },
    enqueue: vi.fn(() => ({ id: 'job-1' })),
    cancel: vi.fn(),
    list: vi.fn(() => [{ id: 'job-1' }])
  }
  const windows = [
    {
      webContents: {
        send: (channel: string, payload: unknown) =>
          sentMessages.push({ channel, payload })
      }
    }
  ]
  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    sentMessages,
    managerMock,
    windows
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }
  },
  BrowserWindow: {
    getAllWindows: () => windows
  }
}))
vi.mock('@main/ytdlp/downloader', () => ({
  downloadManager: () => managerMock
}))

import { registerDownloadIPC } from '@main/ipc/download'

beforeEach(() => {
  handlers.clear()
  sentMessages.length = 0
  managerMock.listeners.clear()
  managerMock.enqueue.mockClear()
  managerMock.cancel.mockClear()
  managerMock.list.mockClear()
  registerDownloadIPC()
})

describe('registerDownloadIPC', () => {
  it('registers start, cancel, and list handlers', () => {
    expect(handlers.has(IPC.download.start)).toBe(true)
    expect(handlers.has(IPC.download.cancel)).toBe(true)
    expect(handlers.has(IPC.download.list)).toBe(true)
  })

  it('start enqueues the request', () => {
    const req = { url: 'https://x', kind: 'video' as const }
    const result = handlers.get(IPC.download.start)!({}, req)
    expect(managerMock.enqueue).toHaveBeenCalledWith(req)
    expect(result).toEqual({ id: 'job-1' })
  })

  it('cancel forwards the id', () => {
    handlers.get(IPC.download.cancel)!({}, 'job-1')
    expect(managerMock.cancel).toHaveBeenCalledWith('job-1')
  })

  it('list returns the manager jobs', () => {
    expect(handlers.get(IPC.download.list)!({})).toEqual([{ id: 'job-1' }])
  })

  it('broadcasts manager update events to all windows', () => {
    managerMock.listeners.get('update')!({ id: 'job-1', progress: 50 })
    expect(sentMessages).toEqual([
      { channel: IPC.download.onUpdate, payload: { id: 'job-1', progress: 50 } }
    ])
  })
})
