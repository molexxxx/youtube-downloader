/**
 * The JavaScript runtime yt-dlp needs for full YouTube support (its EJS challenge solver): this app's own Electron
 * binary, which runs as Node under {@link ytdlpEnv}. A deno on PATH still takes precedence, as yt-dlp ranks it first.
 * Relies on Electron's RunAsNode fuse staying enabled.
 */

function runtime(): string {
  return `node:${process.execPath}`
}

/** The `--js-runtimes` arguments for a spawned yt-dlp. */
export function ytdlpRuntimeArgs(): string[] {
  return ['--js-runtimes', runtime()]
}

/** The same runtime as youtube-dl-exec flags. */
export function ytdlpRuntimeFlags(): { jsRuntimes: string } {
  return { jsRuntimes: runtime() }
}

/** The environment every yt-dlp run takes, so the Electron runtime above starts as plain Node. */
export function ytdlpEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
}
