import { logger } from '../logger'
import { getDiscordService } from './client'
import { getAutoConnect } from './settings'
import { hasToken, loadToken } from './token'

export { getDiscordService } from './client'

/**
 * Log which Opus encoder / encryption backend @discordjs/voice picked, so
 * "native modules failed to load, silently fell back to the slow pure-JS path"
 * is visible in the app log instead of only as degraded playback.
 */
async function logVoiceBackends(): Promise<void> {
  try {
    // Lazy import keeps voice (and its native probing) off the startup path
    // when no token is configured.
    const { generateDependencyReport } = await import('@discordjs/voice')
    const report = generateDependencyReport()
    const opus = report.match(/- @discordjs\/opus: (\S+)/)?.[1] ?? 'not found'
    logger.info(
      `Discord voice backends - native opus: ${opus === 'not found' ? 'MISSING (using opusscript fallback)' : opus}`
    )
  } catch {
    // Diagnostic only.
  }
}

/** Auto-connect the bot on launch when a token is stored and auto-connect is on. */
export async function initDiscord(): Promise<void> {
  if (!hasToken() || !getAutoConnect()) return
  const token = loadToken()
  if (!token) return
  void logVoiceBackends()
  try {
    await getDiscordService().login(token)
  } catch (err) {
    logger.warn(
      'Discord auto-connect failed:',
      err instanceof Error ? err.message : String(err)
    )
  }
}

/** Best-effort graceful teardown: leave voice channels and close the gateway. */
export async function shutdownDiscord(): Promise<void> {
  try {
    await getDiscordService().disconnect()
  } catch (err) {
    logger.warn(
      'Discord shutdown failed:',
      err instanceof Error ? err.message : String(err)
    )
  }
}
