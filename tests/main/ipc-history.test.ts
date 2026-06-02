import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const {
  handlers,
  sentMessages,
  windows,
  getHistoryMock,
  removeHistoryMock,
  clearHistoryMock,
  subscribeHistoryMock
} = vi.hoisted(() => {
  const sentMessages: Array<{ channel: string; payload: unknown }> = []
  let subscriber: ((entries: unknown) => void) | null = null
  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    sentMessages,
    windows: [
      {
        webContents: {
          send: (channel: string, payload: unknown) => sentMessages.push({ channel, payload })
        }
      }
    ],
    getHistoryMock: vi.fn(() => [{ id: 'h1' }]),
    removeHistoryMock: vi.fn(),
    clearHistoryMock: vi.fn(),
    subscribeHistoryMock: vi.fn((fn: (entries: unknown) => void) => {
      subscriber = fn
      return () => {
        subscriber = null
      }
    }),
    emit: (entries: unknown) => subscriber?.(entries)
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }
  },
  BrowserWindow: { getAllWindows: () => windows }
}))
vi.mock('@main/history', () => ({
  getHistory: getHistoryMock,
  removeHistory: removeHistoryMock,
  clearHistory: clearHistoryMock,
  subscribeHistory: subscribeHistoryMock
}))

import { registerHistoryIPC } from '@main/ipc/history'

let capturedSubscriber: ((entries: unknown) => void) | undefined

beforeEach(() => {
  handlers.clear()
  sentMessages.length = 0
  getHistoryMock.mockClear()
  removeHistoryMock.mockClear()
  clearHistoryMock.mockClear()
  subscribeHistoryMock.mockClear()
  registerHistoryIPC()
  capturedSubscriber = subscribeHistoryMock.mock.calls[0]?.[0]
})

describe('registerHistoryIPC', () => {
  it('registers list, remove, and clear handlers', () => {
    expect(handlers.has(IPC.history.list)).toBe(true)
    expect(handlers.has(IPC.history.remove)).toBe(true)
    expect(handlers.has(IPC.history.clear)).toBe(true)
  })

  it('list returns history entries', () => {
    expect(handlers.get(IPC.history.list)!({})).toEqual([{ id: 'h1' }])
  })

  it('remove forwards the id', () => {
    handlers.get(IPC.history.remove)!({}, 'h1')
    expect(removeHistoryMock).toHaveBeenCalledWith('h1')
  })

  it('clear wipes history', () => {
    handlers.get(IPC.history.clear)!({})
    expect(clearHistoryMock).toHaveBeenCalled()
  })

  it('broadcasts history changes to all windows', () => {
    capturedSubscriber?.([{ id: 'h2' }])
    expect(sentMessages).toEqual([{ channel: IPC.history.onChange, payload: [{ id: 'h2' }] }])
  })
})
