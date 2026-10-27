import { join } from 'path'
import { ffmpegInstaller } from '.'

/** The folder holding the ffmpeg and ffprobe the app runs; yt-dlp takes it as `--ffmpeg-location`. */
export function ffmpegDir(): string {
  return ffmpegInstaller().dir()
}

/** The ffmpeg the app runs. */
export function ffmpegPath(): string {
  return join(ffmpegDir(), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
}
