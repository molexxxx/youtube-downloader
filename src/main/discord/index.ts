import { logger } from '../logger'
import { getDiscordService } from './client'
import { getAutoConnect } from './settings'
import { hasToken, loadToken } from './token'

export { getDiscordService } from './client'

/** Auto-connect the bot on launch when a token is stored and auto-connect is on. */
export async function initDiscord(): Promise<void> {
  if (!hasToken() || !getAutoConnect()) return
  const token = loadToken()
  if (!token) return
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
