import { BrowserWindow, ipcMain } from 'electron'
import {
  IPC,
  type AuditEntry,
  type DiscordGuild,
  type DiscordStatus,
  type GuildPlayerState,
  type GuildSettings,
  type LoopMode,
  type PlayerControl,
  type TrackInput,
  type TrackRequester
} from '@shared/types'
import { getDiscordService } from '../discord'
import { getAudit, subscribeAudit } from '../discord/audit'
import { getGuildSettings, setGuildSettings } from '../discord/settings'
import { clearToken, loadToken, saveToken } from '../discord/token'

/** Every action driven from the desktop UI is attributed to the local host. */
const UI_REQUESTER: TrackRequester = { source: 'ui', userId: null, username: 'You' }

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerDiscordIPC(): void {
  const service = getDiscordService()

  service.on('status', (s: DiscordStatus) => broadcast(IPC.discord.onStatus, s))
  service.on('guilds', (g: DiscordGuild[]) => broadcast(IPC.discord.onGuilds, g))
  service.on('player', (p: GuildPlayerState) => broadcast(IPC.discord.onPlayer, p))
  subscribeAudit((entries: AuditEntry[]) => broadcast(IPC.discord.onAudit, entries))

  ipcMain.handle(IPC.discord.status, () => service.getStatus())
  ipcMain.handle(IPC.discord.guilds, () => service.getGuilds())

  ipcMain.handle(IPC.discord.setToken, async (_e, token: string) => {
    saveToken(token)
    try {
      await service.login(token)
    } catch {
      // The error is captured in the status the renderer reads back.
    }
    return service.getStatus()
  })

  ipcMain.handle(IPC.discord.clearToken, async () => {
    await service.disconnect()
    clearToken()
    return service.getStatus()
  })

  ipcMain.handle(IPC.discord.connect, async () => {
    const token = loadToken()
    if (token) {
      try {
        await service.login(token)
      } catch {
        // Status reflects the failure.
      }
    }
    return service.getStatus()
  })

  ipcMain.handle(IPC.discord.disconnect, async () => {
    await service.disconnect()
    return service.getStatus()
  })

  ipcMain.handle(IPC.discord.player, (_e, guildId: string) =>
    service.getPlayerState(guildId)
  )

  ipcMain.handle(IPC.discord.join, async (_e, guildId: string, channelId: string) => {
    await service.playerFor(guildId)?.join(channelId, UI_REQUESTER)
  })

  ipcMain.handle(IPC.discord.leave, (_e, guildId: string) => {
    service.playerFor(guildId)?.leave(UI_REQUESTER)
  })

  ipcMain.handle(IPC.discord.enqueue, (_e, guildId: string, inputs: TrackInput[]) =>
    service.enqueue(guildId, inputs, UI_REQUESTER)
  )

  ipcMain.handle(IPC.discord.control, (_e, guildId: string, action: PlayerControl) => {
    service.playerFor(guildId)?.control(action, UI_REQUESTER)
  })

  ipcMain.handle(IPC.discord.setLoop, (_e, guildId: string, mode: LoopMode) => {
    service.playerFor(guildId)?.setLoop(mode, UI_REQUESTER)
  })

  ipcMain.handle(IPC.discord.setVolume, (_e, guildId: string, volume: number) => {
    service.playerFor(guildId)?.setVolume(volume, UI_REQUESTER)
  })

  ipcMain.handle(IPC.discord.seek, (_e, guildId: string, seconds: number) => {
    service.playerFor(guildId)?.seek(seconds, UI_REQUESTER)
  })

  ipcMain.handle(IPC.discord.removeTrack, (_e, guildId: string, index: number) => {
    service.playerFor(guildId)?.removeTrack(index, UI_REQUESTER)
  })

  ipcMain.handle(
    IPC.discord.moveTrack,
    (_e, guildId: string, from: number, to: number) => {
      service.playerFor(guildId)?.moveTrack(from, to, UI_REQUESTER)
    }
  )

  ipcMain.handle(IPC.discord.getSettings, (_e, guildId: string) =>
    getGuildSettings(guildId)
  )

  ipcMain.handle(
    IPC.discord.setSettings,
    (_e, guildId: string, partial: Partial<GuildSettings>) =>
      setGuildSettings(guildId, partial)
  )

  ipcMain.handle(IPC.discord.auditList, (_e, guildId?: string) => getAudit(guildId))
}
