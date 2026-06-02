import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerConfigIPC: vi.fn(),
  registerBinariesIPC: vi.fn(),
  registerExtractIPC: vi.fn(),
  registerDownloadIPC: vi.fn(),
  registerSystemIPC: vi.fn(),
  registerLogsIPC: vi.fn(),
  registerCookiesIPC: vi.fn(),
  registerHistoryIPC: vi.fn()
}))

vi.mock('@main/ipc/config', () => ({ registerConfigIPC: mocks.registerConfigIPC }))
vi.mock('@main/ipc/binaries', () => ({ registerBinariesIPC: mocks.registerBinariesIPC }))
vi.mock('@main/ipc/extract', () => ({ registerExtractIPC: mocks.registerExtractIPC }))
vi.mock('@main/ipc/download', () => ({ registerDownloadIPC: mocks.registerDownloadIPC }))
vi.mock('@main/ipc/system', () => ({ registerSystemIPC: mocks.registerSystemIPC }))
vi.mock('@main/ipc/logs', () => ({ registerLogsIPC: mocks.registerLogsIPC }))
vi.mock('@main/ipc/cookies', () => ({ registerCookiesIPC: mocks.registerCookiesIPC }))
vi.mock('@main/ipc/history', () => ({ registerHistoryIPC: mocks.registerHistoryIPC }))

import { registerIPC } from '@main/ipc'

beforeEach(() => vi.clearAllMocks())

describe('registerIPC', () => {
  it('registers every IPC domain exactly once', () => {
    registerIPC()
    for (const fn of Object.values(mocks)) {
      expect(fn).toHaveBeenCalledTimes(1)
    }
  })
})
