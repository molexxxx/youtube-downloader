/**
 * The clock and scheduling seam for the binary updaters, so tests drive every wait with a manual scheduler instead
 * of real time.
 */

/** The opaque handle `Timers.setTimeout` returns. */
export type TimerHandle = unknown

/** A clock plus one-shot timers. */
export interface Timers {
  /** Milliseconds since the Unix epoch. */
  now(): number
  setTimeout(fn: () => void, ms: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
  /** Resolves after `ms`; never rejects. */
  sleep(ms: number): Promise<void>
}

/** The real clock and the platform's timers. */
export const realTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}
