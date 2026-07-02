import { execFile } from 'child_process'
import { constants, getPriority, setPriority } from 'os'
import { logger } from '../logger'

const WINDOWS_TUNING_STATE = {
  originalPriority: 0,
  originalPlan: '',
  applied: false
}

// Only switch to a plan that is genuinely performance-oriented; if the machine
// has none (e.g. only Balanced), keep the current plan and rely on the process
// priority boost alone.
const HIGH_PERFORMANCE_PLAN_HINTS = [
  'High performance',
  'High Performance',
  'Ultimate Performance'
]

const PLAN_GUID_RE =
  /([0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12})/

// powercfg calls used to block the event loop mid track-transition (execFileSync);
// they now run async and are serialized so an apply/restore pair can never
// interleave.
let opChain: Promise<void> = Promise.resolve()

function serialize(op: () => Promise<void>): Promise<void> {
  opChain = opChain.then(op, op)
  return opChain
}

function runPowercfg(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('powercfg', args, { encoding: 'utf8', windowsHide: true }, (err, stdout) =>
      resolve(err ? '' : String(stdout))
    )
  })
}

/**
 * Raise this process's priority and switch to a high-performance power plan.
 * Called once per voice session (on channel join), not per track, so the power
 * plan no longer flip-flops between songs.
 */
export function applyWindowsPlaybackTuning(): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve()
  return serialize(async () => {
    if (WINDOWS_TUNING_STATE.applied) return
    try {
      WINDOWS_TUNING_STATE.originalPriority = getPriority(0)
      try {
        setPriority(0, constants.priority.PRIORITY_ABOVE_NORMAL)
      } catch {
        setPriority(0, constants.priority.PRIORITY_NORMAL)
      }

      const activeScheme = await runPowercfg(['/getactivescheme'])
      const match = activeScheme.match(PLAN_GUID_RE)
      if (match) {
        WINDOWS_TUNING_STATE.originalPlan = match[1]
      }

      const availablePlans = await runPowercfg(['/list'])
      const preferred = availablePlans
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => HIGH_PERFORMANCE_PLAN_HINTS.some((hint) => line.includes(hint)))

      const planId = preferred?.match(PLAN_GUID_RE)
      if (planId && planId[1] !== WINDOWS_TUNING_STATE.originalPlan) {
        await runPowercfg(['/setactive', planId[1]])
        logger.debug('Playback tuning: switched power plan for voice session')
      }

      WINDOWS_TUNING_STATE.applied = true
    } catch {
      WINDOWS_TUNING_STATE.applied = false
    }
  })
}

/** Undo {@link applyWindowsPlaybackTuning}. Called when the voice session ends. */
export function restoreWindowsPlaybackTuning(): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve()
  return serialize(async () => {
    if (!WINDOWS_TUNING_STATE.applied) return
    try {
      setPriority(0, WINDOWS_TUNING_STATE.originalPriority)
      if (WINDOWS_TUNING_STATE.originalPlan) {
        await runPowercfg(['/setactive', WINDOWS_TUNING_STATE.originalPlan])
      }
    } catch {
      // Ignore restore failures; the app can still keep running.
    } finally {
      WINDOWS_TUNING_STATE.applied = false
      WINDOWS_TUNING_STATE.originalPlan = ''
    }
  })
}

/**
 * Best-effort priority boost for a spawned audio child (ffmpeg). Keeps the
 * realtime decode pipeline responsive when the host is under load; failures
 * (unsupported platform, insufficient rights) are ignored.
 */
export function boostProcessPriority(pid: number | undefined): void {
  if (!pid) return
  try {
    setPriority(pid, constants.priority.PRIORITY_ABOVE_NORMAL)
  } catch {
    // Not critical - the child keeps default priority.
  }
}
