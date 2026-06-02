import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DownloadJob } from '@shared/types'

const {
  managerMock,
  addHistoryMock,
  notifyDownloadMock,
  updateTrayMock
} = vi.hoisted(() => ({
  managerMock: {
    listeners: new Map<string, (job: unknown) => void>(),
    on(event: string, fn: (job: unknown) => void) {
      this.listeners.set(event, fn)
    },
    list: vi.fn(() => [{ id: 'j1' }])
  },
  addHistoryMock: vi.fn(),
  notifyDownloadMock: vi.fn(),
  updateTrayMock: vi.fn()
}))

vi.mock('@main/ytdlp/downloader', () => ({ downloadManager: () => managerMock }))
vi.mock('@main/history', () => ({ addHistory: addHistoryMock }))
vi.mock('@main/notifications', () => ({ notifyDownload: notifyDownloadMock }))
vi.mock('@main/tray', () => ({ updateTray: updateTrayMock }))

import { initDownloadObserver } from '@main/download-observer'

const job = (overrides: Partial<DownloadJob> = {}): DownloadJob =>
  ({
    id: 'j1',
    url: 'https://x',
    title: 'Clip',
    kind: 'video',
    state: 'completed',
    outputPath: '/out.mp4',
    ...overrides
  }) as DownloadJob

function emit(j: DownloadJob): void {
  managerMock.listeners.get('update')!(j)
}

beforeEach(() => {
  managerMock.listeners.clear()
  vi.clearAllMocks()
  initDownloadObserver()
})

describe('initDownloadObserver', () => {
  it('updates the tray on every update', () => {
    emit(job({ id: 'a', state: 'downloading' }))
    expect(updateTrayMock).toHaveBeenCalledWith([{ id: 'j1' }])
  })

  it('ignores non-terminal states for history', () => {
    emit(job({ id: 'b', state: 'downloading' }))
    expect(addHistoryMock).not.toHaveBeenCalled()
  })

  it('records a completed job to history and notifies', () => {
    emit(job({ id: 'c', state: 'completed', title: 'Done' }))
    expect(addHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c', status: 'completed', title: 'Done' })
    )
    expect(notifyDownloadMock).toHaveBeenCalled()
  })

  it('records each job only once', () => {
    emit(job({ id: 'd', state: 'completed' }))
    emit(job({ id: 'd', state: 'completed' }))
    expect(addHistoryMock).toHaveBeenCalledTimes(1)
  })

  it('records cancelled jobs but does not notify', () => {
    emit(job({ id: 'e', state: 'cancelled' }))
    expect(addHistoryMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
    expect(notifyDownloadMock).not.toHaveBeenCalled()
  })

  it('records errored jobs and notifies', () => {
    emit(job({ id: 'f', state: 'error', error: 'boom' }))
    expect(addHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', error: 'boom' })
    )
    expect(notifyDownloadMock).toHaveBeenCalled()
  })
})
