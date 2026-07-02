import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock, getPriorityMock, setPriorityMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  getPriorityMock: vi.fn(() => 2),
  setPriorityMock: vi.fn()
}))

vi.mock('child_process', () => ({
  execFile: execFileMock
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

import {
  applyWindowsPlaybackTuning,
  boostProcessPriority,
  restoreWindowsPlaybackTuning
} from '../../src/main/discord/windows-tuning'

type ExecCallback = (err: Error | null, stdout: string) => void

function mockPowercfg(planList: string): void {
  execFileMock.mockImplementation(
    (_command: string, args: string[], _opts: unknown, cb: ExecCallback) => {
      if (args[0] === '/getactivescheme') {
        cb(null, 'Power Scheme GUID: 11111111-2222-3333-4444-555555555555  (Balanced)')
      } else if (args[0] === '/list') {
        cb(null, planList)
      } else {
        cb(null, '')
      }
    }
  )
}

describe('windows playback tuning', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    execFileMock.mockReset()
    getPriorityMock.mockReset()
    setPriorityMock.mockReset()
    getPriorityMock.mockReturnValue(2)
    mockPowercfg(
      'Power Scheme GUID: 22222222-3333-4444-5555-666666666666  (High performance)'
    )
    Object.defineProperty(process, 'platform', { value: 'win32' })
  })

  afterEach(async () => {
    // Module-level tuning state persists between tests; restore to reset it.
    await restoreWindowsPlaybackTuning()
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('raises the process priority and switches to a high-performance power plan', async () => {
    await applyWindowsPlaybackTuning()

    expect(setPriorityMock).toHaveBeenCalledWith(0, 3)
    expect(execFileMock).toHaveBeenCalledWith(
      'powercfg',
      ['/getactivescheme'],
      expect.anything(),
      expect.anything()
    )
    expect(execFileMock).toHaveBeenCalledWith(
      'powercfg',
      ['/list'],
      expect.anything(),
      expect.anything()
    )
    expect(execFileMock).toHaveBeenCalledWith(
      'powercfg',
      ['/setactive', '22222222-3333-4444-5555-666666666666'],
      expect.anything(),
      expect.anything()
    )
  })

  it('restores the prior power plan and priority once the session ends', async () => {
    await applyWindowsPlaybackTuning()
    await restoreWindowsPlaybackTuning()

    expect(setPriorityMock).toHaveBeenCalledWith(0, 2)
    expect(execFileMock).toHaveBeenCalledWith(
      'powercfg',
      ['/setactive', '11111111-2222-3333-4444-555555555555'],
      expect.anything(),
      expect.anything()
    )
  })

  it('keeps the current plan when no high-performance plan exists', async () => {
    mockPowercfg('Power Scheme GUID: 11111111-2222-3333-4444-555555555555  (Balanced)')

    await applyWindowsPlaybackTuning()

    expect(setPriorityMock).toHaveBeenCalledWith(0, 3)
    const setActiveCalls = execFileMock.mock.calls.filter(
      (call) => call[1][0] === '/setactive'
    )
    expect(setActiveCalls).toHaveLength(0)
  })

  it('only applies once per session', async () => {
    await applyWindowsPlaybackTuning()
    execFileMock.mockClear()

    await applyWindowsPlaybackTuning()

    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('boosts a child process priority best-effort', () => {
    boostProcessPriority(4321)
    expect(setPriorityMock).toHaveBeenCalledWith(4321, 3)

    setPriorityMock.mockImplementationOnce(() => {
      throw new Error('denied')
    })
    expect(() => boostProcessPriority(9999)).not.toThrow()
    expect(() => boostProcessPriority(undefined)).not.toThrow()
  })
})
