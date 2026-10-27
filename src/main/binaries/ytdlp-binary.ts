import type { ChildProcess, SpawnOptions } from 'child_process'
import type { Create } from 'youtube-dl-exec'
import { ytdlpUpdater } from '.'
import { ytdlpEnv } from './runtime'

type Engine = ReturnType<Create>

/** The yt-dlp the app runs. */
export function ytdlpPath(): string {
  return ytdlpUpdater().path()
}

export { ytdlpEnv, ytdlpRuntimeArgs, ytdlpRuntimeFlags } from './runtime'

/** Counts a spawned yt-dlp until it exits, so an update never replaces the binary under a running process. */
export function trackYtdlp<T extends ChildProcess>(child: T): T {
  ytdlpUpdater().track(
    new Promise<void>((resolve) => {
      child.once('close', () => resolve())
      child.once('error', () => resolve())
    })
  )
  return child
}

/** A youtube-dl-exec engine whose runs get {@link ytdlpEnv} and are counted like {@link trackYtdlp}. */
export function managedEngine(inner: Engine): Engine {
  const updater = ytdlpUpdater()
  const withEnv = (options?: SpawnOptions): SpawnOptions => ({
    ...options,
    env: { ...ytdlpEnv(), ...options?.env }
  })
  const run = ((url: string, flags?: Parameters<Engine>[1], options?: SpawnOptions) =>
    updater.track(inner(url, flags, withEnv(options)))) as Engine
  run.exec = (url, flags, options) =>
    updater.track(inner.exec(url, flags, withEnv(options)))
  return run
}
