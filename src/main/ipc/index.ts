import { registerConfigIPC } from './config'
import { registerBinariesIPC } from './binaries'
import { registerExtractIPC } from './extract'
import { registerDownloadIPC } from './download'
import { registerSystemIPC } from './system'
import { registerLogsIPC } from './logs'
import { registerCookiesIPC } from './cookies'
import { registerHistoryIPC } from './history'

export function registerIPC(): void {
  registerConfigIPC()
  registerBinariesIPC()
  registerExtractIPC()
  registerDownloadIPC()
  registerSystemIPC()
  registerLogsIPC()
  registerCookiesIPC()
  registerHistoryIPC()
}
