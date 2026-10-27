import type { AuditAction } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

const ACTION_LABEL: Record<AuditAction, string> = {
  connect: 'connected',
  disconnect: 'disconnected',
  join: 'joined',
  leave: 'left voice',
  play: 'started playing',
  enqueue: 'queued',
  skip: 'skipped',
  pause: 'paused',
  resume: 'resumed',
  stop: 'stopped',
  clear: 'cleared the queue',
  shuffle: 'shuffled the queue',
  loop: 'set loop',
  volume: 'set volume to',
  remove: 'removed',
  move: 'reordered',
  seek: 'jumped',
  effects: 'set effects:',
  'permission-denied': 'was denied',
  error: 'hit an error'
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Live, persisted activity feed for the active server, on the sheet. Discord
 * members are set in the Discord signal; actions from this app read in ink.
 */
export function AuditLogPanel(): React.JSX.Element | null {
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const entries = useAppStore((s) => s.audit)

  if (!activeGuildId) return null
  const guildEntries = entries.filter((e) => e.guildId === activeGuildId).slice(0, 50)

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-5">
      <p className="text-[13px] text-[var(--t-dim)]">
        From this app and from Discord members
      </p>
      {guildEntries.length === 0 ? (
        <p className="pt-5 text-sm text-[var(--t-dim)]">
          Nothing yet - actions from you and Discord members show up here.
        </p>
      ) : (
        <ul className="scroll-ink -mr-6 min-h-0 flex-1 overflow-y-auto pr-[14px]">
          {guildEntries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-baseline justify-between gap-3 border-b border-[var(--t-rule)] py-2.5 text-[13px]"
            >
              <span className="min-w-0">
                <span
                  className={`font-semibold ${
                    entry.actor.source === 'discord' ? 'text-[var(--t-blue)]' : ''
                  }`}
                >
                  {entry.actor.username}
                </span>{' '}
                <span
                  className={
                    entry.action === 'error'
                      ? 'text-[var(--t-red)]'
                      : 'text-[var(--t-dim)]'
                  }
                >
                  {ACTION_LABEL[entry.action]}
                </span>{' '}
                {entry.detail && <span>{entry.detail}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--t-faint)]">
                {timeAgo(entry.ts)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
