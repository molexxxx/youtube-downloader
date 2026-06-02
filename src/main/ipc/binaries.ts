import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type BootstrapProgress } from '@shared/types'
import {
  ensureYtdlp,
  updateYtdlp,
  ytdlpStatus
} from '../binaries/ytdlp-binary'
import { ensureFfmpeg, ffmpegStatus, updateFfmpeg } from '../binaries/ffmpeg-binary'

function broadcast(progress: BootstrapProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.binaries.onProgress, progress)
  }
}

// Shared in-flight bootstrap so concurrent callers (e.g. StrictMode double-mount
// or rapid retries) never race on the same binary files.
let bootstrapInFlight: Promise<{
  ytdlp: Awaited<ReturnType<typeof ensureYtdlp>>
  ffmpeg: Awaited<ReturnType<typeof ensureFfmpeg>>
}> | null = null

async function runBootstrap() {
  const ytdlp = await ensureYtdlp(broadcast)
  const ffmpeg = await ensureFfmpeg(broadcast)
  return { ytdlp, ffmpeg }
}

export function registerBinariesIPC(): void {
  ipcMain.handle(IPC.binaries.status, async () => {
    // Run both version probes concurrently — each spawns the binary and can
    // take a moment, so serial awaits noticeably delayed the UI unlock.
    const [ytdlp, ffmpeg] = await Promise.all([ytdlpStatus(), ffmpegStatus()])
    return { ytdlp, ffmpeg }
  })

  ipcMain.handle(IPC.binaries.bootstrap, async () => {
    if (!bootstrapInFlight) {
      bootstrapInFlight = runBootstrap().finally(() => {
        bootstrapInFlight = null
      })
    }
    return bootstrapInFlight
  })

  ipcMain.handle(IPC.binaries.update, async (_e, which: 'yt-dlp' | 'ffmpeg' | 'all') => {
    if (which === 'yt-dlp') return { ytdlp: await updateYtdlp(broadcast) }
    if (which === 'ffmpeg') return { ffmpeg: await updateFfmpeg(broadcast) }
    return {
      ytdlp: await updateYtdlp(broadcast),
      ffmpeg: await updateFfmpeg(broadcast)
    }
  })
}
