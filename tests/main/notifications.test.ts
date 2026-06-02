import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DownloadJob } from '@shared/types'

const { NotificationMock, isSupportedMock, getConfigMock, getMainWindowMock, instances } =
  vi.hoisted(() => {
    const instances: Array<{
      options: Record<string, unknown>
      handlers: Map<string, () => void>
      show: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
    }> = []
    const isSupportedMock = vi.fn(() => true)
    class NotificationMock {
      static isSupported = isSupportedMock
      options: Record<string, unknown>
      handlers = new Map<string, () => void>()
      show = vi.fn()
      on = vi.fn((event: string, cb: () => void) => {
        this.handlers.set(event, cb)
        return this
      })
      constructor(options: Record<string, unknown>) {
        this.options = options
        instances.push(this)
      }
    }
    return {
      NotificationMock,
      isSupportedMock,
      getConfigMock: vi.fn(() => ({ notifications: true })),
      getMainWindowMock: vi.fn(),
      instances
    }
  })

vi.mock('electron', () => ({ Notification: NotificationMock }))
vi.mock('@main/config', () => ({ getConfig: getConfigMock }))
vi.mock('@main/windows', () => ({ getMainWindow: getMainWindowMock }))

import { notifyDownload } from '@main/notifications'

const baseJob = (overrides: Partial<DownloadJob> = {}): DownloadJob =>
  ({
    id: 'j1',
    url: 'https://x',
    title: 'Clip',
    kind: 'video',
    state: 'completed',
    ...overrides
  }) as DownloadJob

beforeEach(() => {
  instances.length = 0
  vi.clearAllMocks()
  isSupportedMock.mockReturnValue(true)
  getConfigMock.mockReturnValue({ notifications: true })
})

describe('notifyDownload', () => {
  it('does nothing when notifications are disabled', () => {
    getConfigMock.mockReturnValue({ notifications: false })
    notifyDownload(baseJob())
    expect(instances).toHaveLength(0)
  })

  it('does nothing when notifications are unsupported', () => {
    isSupportedMock.mockReturnValue(false)
    notifyDownload(baseJob())
    expect(instances).toHaveLength(0)
  })

  it('shows a success notification with the job title', () => {
    notifyDownload(baseJob({ title: 'My Video' }))
    expect(instances).toHaveLength(1)
    expect(instances[0].options).toMatchObject({ title: 'Download complete', body: 'My Video' })
    expect(instances[0].show).toHaveBeenCalled()
  })

  it('shows a failure notification with the error', () => {
    notifyDownload(baseJob({ state: 'error', title: 'Bad', error: 'network' }))
    expect(instances[0].options).toMatchObject({
      title: 'Download failed',
      body: 'Bad - network'
    })
  })

  it('shows a failure notification with a fallback error message', () => {
    notifyDownload(baseJob({ state: 'error', title: 'Bad', error: undefined }))
    expect(instances[0].options.body).toBe('Bad - unknown error')
  })

  it('focuses the window on click, restoring when minimized', () => {
    const win = {
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    }
    getMainWindowMock.mockReturnValue(win)
    notifyDownload(baseJob())
    instances[0].handlers.get('click')!()
    expect(win.restore).toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })

  it('click handler is safe when there is no window', () => {
    getMainWindowMock.mockReturnValue(null)
    notifyDownload(baseJob())
    expect(() => instances[0].handlers.get('click')!()).not.toThrow()
  })

  it('click handler skips restore when not minimized', () => {
    const win = {
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    }
    getMainWindowMock.mockReturnValue(win)
    notifyDownload(baseJob())
    instances[0].handlers.get('click')!()
    expect(win.restore).not.toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })
})
