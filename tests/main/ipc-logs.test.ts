import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/types'

const { handlers, sentMessages, windows, historyMock, subscribeMock } = vi.hoisted(() => {
  const sentMessages: Array<{ channel: string; payload: unknown }> = []
  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    sentMessages,
    windows: [
      {
        webContents: {
          send: (channel: string, payload: unknown) =>
            sentMessages.push({ channel, payload })
        }
      }
    ],
    historyMock: vi.fn(() => [{ level: 'info', message: 'hi' }]),
    subscribeMock: vi.fn()
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
vi.mock('@main/logger', () => ({
  logger: { history: historyMock, subscribe: subscribeMock }
}))

import { registerLogsIPC } from '@main/ipc/logs'

beforeEach(() => {
  handlers.clear()
  sentMessages.length = 0
  historyMock.mockClear()
  subscribeMock.mockClear()
  registerLogsIPC()
})

describe('registerLogsIPC', () => {
  it('registers the list handler', () => {
    expect(handlers.has(IPC.logs.list)).toBe(true)
  })

  it('list returns the logger history', () => {
    expect(handlers.get(IPC.logs.list)!({})).toEqual([{ level: 'info', message: 'hi' }])
  })

  it('broadcasts new log entries to all windows', () => {
    const subscriber = subscribeMock.mock.calls[0]?.[0] as (entry: unknown) => void
    subscriber({ level: 'error', message: 'boom' })
    expect(sentMessages).toEqual([
      { channel: IPC.logs.onEntry, payload: { level: 'error', message: 'boom' } }
    ])
  })
})
