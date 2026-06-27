import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileSyncMock, getPriorityMock, setPriorityMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  getPriorityMock: vi.fn(() => 2),
  setPriorityMock: vi.fn()
}))

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock
}))

vi.mock('os', () => ({
  constants: {
    priority: {
      PRIORITY_ABOVE_NORMAL: 3,
      PRIORITY_NORMAL: 2
    }
  },
  getPriority: getPriorityMock,
  setPriority: setPriorityMock
}))

import { applyWindowsPlaybackTuning, restoreWindowsPlaybackTuning } from '@main/discord/windows-tuning'

describe('windows playback tuning', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    execFileSyncMock.mockReset()
    getPriorityMock.mockReset()
    setPriorityMock.mockReset()
    getPriorityMock.mockReturnValue(2)
    execFileSyncMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === '/getactivescheme') {
        return 'Power Scheme GUID: 11111111-2222-3333-4444-555555555555  (Balanced)'
      }
      if (args[0] === '/list') {
        return 'Power Scheme GUID: 22222222-3333-4444-5555-666666666666  (High performance)'
      }
      return ''
    })
    Object.defineProperty(process, 'platform', { value: 'win32' })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('raises the process priority and switches to a high-performance power plan while playing', () => {
    applyWindowsPlaybackTuning()

    expect(setPriorityMock).toHaveBeenCalledWith(0, 3)
    expect(execFileSyncMock).toHaveBeenCalledWith('powercfg', ['/getactivescheme'], expect.anything())
    expect(execFileSyncMock).toHaveBeenCalledWith('powercfg', ['/list'], expect.anything())
    expect(execFileSyncMock).toHaveBeenCalledWith('powercfg', ['/setactive', '22222222-3333-4444-5555-666666666666'], expect.anything())
  })

  it('restores the prior power plan and priority once playback stops', () => {
    applyWindowsPlaybackTuning()
    restoreWindowsPlaybackTuning()

    expect(setPriorityMock).toHaveBeenCalledWith(0, 2)
    expect(execFileSyncMock).toHaveBeenCalledWith('powercfg', ['/setactive', '11111111-2222-3333-4444-555555555555'], expect.anything())
  })
})
