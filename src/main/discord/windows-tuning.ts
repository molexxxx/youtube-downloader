import { execFileSync } from 'child_process'
import { constants, getPriority, setPriority } from 'os'

const WINDOWS_TUNING_STATE = {
  originalPriority: 0,
  originalPlan: '',
  applied: false
}

const HIGH_PERFORMANCE_PLAN_HINTS = [
  'High performance',
  'High Performance',
  'Balanced',
  'Balanced High Performance'
]

export function applyWindowsPlaybackTuning(): void {
  if (process.platform !== 'win32' || WINDOWS_TUNING_STATE.applied) return

  try {
    WINDOWS_TUNING_STATE.originalPriority = getPriority(0)
    try {
      setPriority(0, constants.priority.PRIORITY_ABOVE_NORMAL)
    } catch {
      setPriority(0, constants.priority.PRIORITY_NORMAL)
    }

    const activeScheme = execFileSync('powercfg', ['/getactivescheme'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const match = activeScheme.match(/([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})/)
    if (match) {
      WINDOWS_TUNING_STATE.originalPlan = match[1]
    }

    const availablePlans = execFileSync('powercfg', ['/list'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const preferred = availablePlans
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => HIGH_PERFORMANCE_PLAN_HINTS.some((hint) => line.includes(hint)))

    if (preferred) {
      const planId = preferred.match(/([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})/)
      if (planId) {
        execFileSync('powercfg', ['/setactive', planId[1]], {
          stdio: ['ignore', 'pipe', 'ignore']
        })
      }
    }

    WINDOWS_TUNING_STATE.applied = true
  } catch {
    WINDOWS_TUNING_STATE.applied = false
  }
}

export function restoreWindowsPlaybackTuning(): void {
  if (process.platform !== 'win32' || !WINDOWS_TUNING_STATE.applied) return

  try {
    setPriority(0, WINDOWS_TUNING_STATE.originalPriority)
    if (WINDOWS_TUNING_STATE.originalPlan) {
      execFileSync('powercfg', ['/setactive', WINDOWS_TUNING_STATE.originalPlan], {
        stdio: ['ignore', 'pipe', 'ignore']
      })
    }
  } catch {
    // Ignore restore failures; the app can still keep running.
  } finally {
    WINDOWS_TUNING_STATE.applied = false
  }
}
