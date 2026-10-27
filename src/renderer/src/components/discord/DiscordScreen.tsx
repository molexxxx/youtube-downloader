import { Fragment, useEffect, useState } from 'react'
import { Bot, Link2, ListMusic, LogOut, Slash, Volume2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { DiscordSetup } from './DiscordSetup'
import { ServerSwitcher } from './ServerSwitcher'
import { VoiceChannelPicker } from './VoiceChannelPicker'
import { PlayerPanel } from './PlayerPanel'
import { QueueList } from './QueueList'
import { SearchPanel } from './SearchPanel'
import { PermissionsPanel } from './PermissionsPanel'
import { AuditLogPanel } from './AuditLogPanel'

type SheetTab = 'queue' | 'activity' | 'settings'

/**
 * Discord dashboard: servers on the floor rail, what is playing on the stage
 * (search, the now-playing hero, voice channels), and what is lined up on the
 * raised side panel, with activity and server settings as tabs on its tape strip.
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
    <div className="focus-ring-indigo signal-blue flex min-h-0 flex-1 overflow-hidden">
      <ServerSwitcher />
      {activeGuildId ? (
        <>
          <section className="stage flex min-h-0 min-w-0 flex-1 flex-col gap-7 px-10 pb-7 pt-6">
            <BotBar />
            <SearchPanel />
            <PlayerPanel />
            <VoiceChannelPicker />
          </section>
          <SheetTabs />
        </>
      ) : (
        <NoServerState inviteUrl={status.inviteUrl ?? null} />
      )}
    </div>
  )
}

function BotBar(): React.JSX.Element {
  const status = useAppStore((s) => s.discordStatus)
  const serverCount = useAppStore((s) => s.discordGuilds.length)
  const setDiscordStatus = useAppStore((s) => s.setDiscordStatus)

  async function disconnect(): Promise<void> {
    setDiscordStatus(await window.api.discord.disconnect())
  }

  return (
    <div className="flex shrink-0 items-center gap-3 text-sm">
      {status?.botUser?.avatar ? (
        <img src={status.botUser.avatar} alt="" className="h-7 w-7 rounded-sm" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-[var(--w-blue)] text-[#fff]">
          <Bot size={15} />
        </span>
      )}
      <span className="font-semibold">{status?.botUser?.username ?? 'Connected'}</span>
      <span className="flex items-center gap-1.5 text-[var(--t-dim)]">
        <span className="h-2 w-2 rounded-full bg-[var(--w-live)]" />
        Online · in {serverCount} {serverCount === 1 ? 'server' : 'servers'}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {status?.inviteUrl && (
          <button
            onClick={() => void window.api.system.openExternal(status.inviteUrl!)}
            className="key key-line h-8 px-3 text-[13px]"
          >
            <Link2 size={14} />
            Invite to a server
          </button>
        )}
        <button
          onClick={() => void disconnect()}
          className="key key-line h-8 px-3 text-[13px] hover:text-[var(--t-red)]"
        >
          <LogOut size={14} />
          Disconnect
        </button>
      </div>
    </div>
  )
}

function SheetTabs(): React.JSX.Element {
  const [tab, setTab] = useState<SheetTab>('queue')
  const queued = useAppStore((s) => {
    const player = s.activeGuildId ? s.playerStates[s.activeGuildId] : undefined
    return player?.queue.length ?? 0
  })

  return (
    <aside
      aria-label="Queue and server"
      className="sheet flex w-[440px] shrink-0 flex-col border-l border-[var(--t-rule)]"
    >
      <div
        role="tablist"
        aria-label="Sheet"
        className="tape mx-6 mt-6 flex shrink-0 gap-1 rounded-sm p-1"
      >
        <SheetTabButton active={tab === 'queue'} onClick={() => setTab('queue')}>
          Up next
          {queued > 0 && (
            <span className="font-normal tabular-nums text-[var(--t-dim)]">{queued}</span>
          )}
        </SheetTabButton>
        <SheetTabButton active={tab === 'activity'} onClick={() => setTab('activity')}>
          Activity
        </SheetTabButton>
        <SheetTabButton active={tab === 'settings'} onClick={() => setTab('settings')}>
          Settings
        </SheetTabButton>
      </div>
      {tab === 'queue' ? (
        <QueueList />
      ) : tab === 'activity' ? (
        <AuditLogPanel />
      ) : (
        <PermissionsPanel />
      )}
    </aside>
  )
}

function SheetTabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-sm py-2 text-[13px] font-semibold transition-colors ${
        active
          ? 'bg-[var(--t-accent-soft)] text-[var(--t-accent-text)] shadow-[inset_0_0_0_1px_var(--t-accent)]'
          : 'text-[var(--t-dim)] hover:text-[var(--t-fg)]'
      }`}
    >
      {children}
    </button>
  )
}

const AFTER_INVITE = [
  { icon: Volume2, label: 'Pick a voice channel' },
  { icon: ListMusic, label: 'Queue anything' },
  { icon: Slash, label: 'Control it from Discord with /play, /skip and /queue' }
] as const

function NoServerState({ inviteUrl }: { inviteUrl: string | null }): React.JSX.Element {
  return (
    <section className="stage flex min-w-0 flex-1 flex-col justify-center px-14 py-10">
      <div className="max-w-3xl">
        <h3 className="display text-[30px]">Your bot is online</h3>
        <p className="mt-4 max-w-md text-[15px] text-[var(--t-dim)]">
          It isn&apos;t in any server yet. Invite it to one you manage and this dashboard
          lights up.
        </p>
        {inviteUrl && (
          <button
            onClick={() => void window.api.system.openExternal(inviteUrl)}
            className="key key-blue mt-8 h-12 px-6 text-[15px]"
          >
            <Link2 size={16} />
            Invite to a server
          </button>
        )}
        <p className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-[var(--t-dim)]">Once it joins:</span>
          {AFTER_INVITE.map(({ icon: Icon, label }, i) => (
            <Fragment key={label}>
              {i > 0 && (
                <span aria-hidden="true" className="text-[var(--t-faint)]">
                  ·
                </span>
              )}
              <span className="flex items-center gap-1.5 font-semibold">
                <Icon size={14} className="shrink-0 text-[var(--t-blue)]" />
                {label}
              </span>
            </Fragment>
          ))}
        </p>
      </div>
    </section>
  )
}
