import { useEffect, useState } from 'react'
import {
  Activity,
  Bot,
  Link2,
  ListMusic,
  LogOut,
  Settings2,
  Slash,
  Volume2
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { DiscordAmbient } from './DiscordAmbient'
import { DiscordSetup } from './DiscordSetup'
import { ServerSwitcher } from './ServerSwitcher'
import { VoiceChannelPicker } from './VoiceChannelPicker'
import { PlayerPanel } from './PlayerPanel'
import { QueueList } from './QueueList'
import { SearchPanel } from './SearchPanel'
import { PermissionsPanel } from './PermissionsPanel'
import { AuditLogPanel } from './AuditLogPanel'

/**
 * Discord dashboard. Layout mirrors Discord's own mental model: servers on a
 * left rail, everything about what's playing in the center, and where/how it
 * plays (voice channels, settings, activity) in the right sidebar.
 */
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <DashboardHeader />
      {activeGuildId ? (
        <div className="flex min-h-0 flex-1 gap-3.5">
          <ServerSwitcher />
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <SearchPanel />
            <PlayerPanel />
            <QueueList />
          </div>
          <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-hidden">
            <VoiceChannelPicker />
            <SidebarTabs />
          </aside>
        </div>
      ) : (
        <NoServerState inviteUrl={status.inviteUrl ?? null} />
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
    <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
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
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Online
        </p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {status?.inviteUrl && (
          <button
            onClick={() => void window.api.system.openExternal(status.inviteUrl!)}
            className="btn btn-indigo px-3 py-1.5 text-xs"
          >
            <Link2 size={14} />
            Invite to a server
          </button>
        )}
        <button
          onClick={() => void disconnect()}
          className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-red-500/40 hover:text-red-300"
        >
          <LogOut size={14} />
          Disconnect
        </button>
      </div>
    </div>
  )
}

function SidebarTabs(): React.JSX.Element {
  const [tab, setTab] = useState<'settings' | 'activity'>('settings')

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex shrink-0 border-b border-white/5">
        <SidebarTab
          active={tab === 'settings'}
          onClick={() => setTab('settings')}
          icon={<Settings2 size={13} />}
          label="Settings"
        />
        <SidebarTab
          active={tab === 'activity'}
          onClick={() => setTab('activity')}
          icon={<Activity size={13} />}
          label="Activity"
        />
      </div>
      {tab === 'settings' ? <PermissionsPanel /> : <AuditLogPanel />}
    </section>
  )
}

function SidebarTab({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-indigo-400 text-indigo-200'
          : 'border-transparent text-white/40 hover:text-white/70'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

const NO_SERVER_HINTS = [
  {
    icon: Link2,
    label: 'Invite the bot',
    hint: 'one click, free, joins with your account'
  },
  {
    icon: Volume2,
    label: 'Pick a voice channel',
    hint: 'choose where the music plays'
  },
  {
    icon: ListMusic,
    label: 'Queue anything',
    hint: 'search, links, playlists, your downloads'
  },
  {
    icon: Slash,
    label: 'Control from Discord',
    hint: '/play, /skip, /queue and more'
  }
] as const

function NoServerState({ inviteUrl }: { inviteUrl: string | null }): React.JSX.Element {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8">
      <DiscordAmbient />
      <div className="relative w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
          <Bot size={28} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-white/90">Your bot is online</h3>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-white/45">
          It isn&apos;t in any server yet. Invite it to one you manage and this dashboard
          lights up.
        </p>
        {inviteUrl && (
          <button
            onClick={() => void window.api.system.openExternal(inviteUrl)}
            className="btn btn-indigo mt-4 px-5 py-2.5 text-sm"
          >
            <Link2 size={15} />
            Invite to a server
          </button>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2.5 text-left">
          {NO_SERVER_HINTS.map(({ icon: Icon, label, hint }) => (
            <div
              key={label}
              className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 backdrop-blur-sm transition-colors hover:border-indigo-500/20 hover:bg-white/[0.04]"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
                <Icon size={15} className="text-indigo-300/80" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white/75">{label}</p>
                <p className="truncate text-[11px] text-white/35">{hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
