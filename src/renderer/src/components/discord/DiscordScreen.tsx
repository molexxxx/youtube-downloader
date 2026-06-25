import { useEffect } from 'react'
import { Bot, Link2, LogOut } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { DiscordSetup } from './DiscordSetup'
import { ServerSwitcher } from './ServerSwitcher'
import { VoiceChannelPicker } from './VoiceChannelPicker'
import { PlayerPanel } from './PlayerPanel'
import { QueueList } from './QueueList'
import { SearchPanel } from './SearchPanel'
import { PermissionsPanel } from './PermissionsPanel'
import { AuditLogPanel } from './AuditLogPanel'

export function DiscordScreen(): React.JSX.Element {
  const status = useAppStore((s) => s.discordStatus)
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const upsertPlayerState = useAppStore((s) => s.upsertPlayerState)
  const setAudit = useAppStore((s) => s.setAudit)

  // Seed the player state and audit log whenever the active server changes (live
  // events keep them current afterwards).
  useEffect(() => {
    if (!activeGuildId) return
    void window.api.discord.player(activeGuildId).then((state) => {
      if (state) upsertPlayerState(state)
    })
    void window.api.discord.auditList(activeGuildId).then(setAudit)
  }, [activeGuildId, upsertPlayerState, setAudit])

  if (!status || status.state !== 'ready') {
    return <DiscordSetup />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <DashboardHeader />
      <ServerSwitcher />
      {activeGuildId ? (
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <SearchPanel />
            <QueueList />
          </div>
          <aside className="scroll-thin flex w-96 shrink-0 flex-col gap-4 overflow-y-auto pr-1">
            <PlayerPanel />
            <VoiceChannelPicker />
            <PermissionsPanel />
            <AuditLogPanel />
          </aside>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-white/40">
          The bot is connected but not in any server yet. Use Invite to add it.
        </div>
      )}
    </div>
  )
}

function DashboardHeader(): React.JSX.Element {
  const status = useAppStore((s) => s.discordStatus)
  const setDiscordStatus = useAppStore((s) => s.setDiscordStatus)

  async function disconnect(): Promise<void> {
    setDiscordStatus(await window.api.discord.disconnect())
  }

  return (
    <div className="flex shrink-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
      {status?.botUser?.avatar ? (
        <img src={status.botUser.avatar} alt="" className="h-8 w-8 rounded-full" />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
          <Bot size={16} />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white/90">
          {status?.botUser?.username ?? 'Connected'}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Online
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {status?.inviteUrl && (
          <button
            onClick={() => void window.api.system.openExternal(status.inviteUrl!)}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
          >
            <Link2 size={14} />
            Invite to server
          </button>
        )}
        <button
          onClick={() => void disconnect()}
          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-red-500/40 hover:text-red-300"
        >
          <LogOut size={14} />
          Disconnect
        </button>
      </div>
    </div>
  )
}
