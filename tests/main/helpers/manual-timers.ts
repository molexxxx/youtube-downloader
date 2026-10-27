/**
 * A manual scheduler that implements `Timers` for tests. Time moves only through `advance`, which runs every due
 * callback in time order and lets pending promise callbacks settle between them, so a day of checks runs in
 * milliseconds and no test needs real sleeps or Vitest fake timers.
 */
import type { TimerHandle, Timers } from '@main/binaries/timers'

interface Entry {
  readonly id: number
  readonly at: number
  readonly fn: () => void
}

/** `Timers` plus the controls a test drives it with. */
export interface ManualTimers extends Timers {
  /** Moves the clock forward by `ms`, running due callbacks in time order and settling promises between them. */
  advance(ms: number): Promise<void>
  /** How many callbacks are scheduled. */
  pending(): number
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** A manual scheduler whose clock starts at `start` milliseconds. */
export function createManualTimers(start = 0): ManualTimers {
  let clock = start
  let lastId = 0
  const entries: Entry[] = []

  function schedule(fn: () => void, ms: number): TimerHandle {
    const delay = Number.isFinite(ms) && ms > 0 ? ms : 0
    const entry: Entry = { id: ++lastId, at: clock + delay, fn }
    const index = entries.findIndex((e) => e.at > entry.at)
    if (index === -1) entries.push(entry)
    else entries.splice(index, 0, entry)
    return entry.id
  }

  function cancel(handle: TimerHandle): void {
    const index = entries.findIndex((e) => e.id === handle)
    if (index !== -1) entries.splice(index, 1)
  }

  return {
    now: () => clock,
    setTimeout: schedule,
    clearTimeout: cancel,
    sleep: (ms) => new Promise((resolve) => schedule(resolve, ms)),
    async advance(ms) {
      const target = clock + ms
      await settle()
      while (entries.length > 0 && entries[0].at <= target) {
        const entry = entries.shift() as Entry
        clock = entry.at
        entry.fn()
        await settle()
      }
      clock = target
    },
    pending: () => entries.length
  }
}
