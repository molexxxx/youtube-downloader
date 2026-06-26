import { ScrollText } from 'lucide-react'
import type { AuditAction } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

const ACTION_LABEL: Record<AuditAction, string> = {
  connect: 'connected',
  disconnect: 'disconnected',
  join: 'joined',
  leave: 'left voice',
  play: 'playing',
  enqueue: 'queued',
  skip: 'skipped',
  pause: 'paused',
  resume: 'resumed',
  stop: 'stopped',
  clear: 'cleared queue',
  shuffle: 'shuffled',
  loop: 'set loop',
  volume: 'set volume',
  remove: 'removed',
  'permission-denied': 'was denied',
  error: 'error'
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

/** Live, persisted audit feed for the active server. */
export function AuditLogPanel(): React.JSX.Element | null {
  const activeGuildId = useAppStore((s) => s.activeGuildId)
  const entries = useAppStore((s) => s.audit)

  if (!activeGuildId) return null
  const guildEntries = entries.filter((e) => e.guildId === activeGuildId).slice(0, 50)

  return (
    <section className="flex min-h-56 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <h3 className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-white/40">
        <ScrollText size={14} />
        Activity
      </h3>
      {guildEntries.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-white/30">No activity yet.</p>
      ) : (
        <ul className="scroll-thin max-h-72 divide-y divide-white/5 overflow-y-auto">
          {guildEntries.map((entry) => (
            <li key={entry.id} className="px-3.5 py-2 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-white/70">
                  <span
                    className={
                      entry.actor.source === 'discord' ? 'text-indigo-300' : 'text-emerald-300'
                    }
                  >
                    {entry.actor.username}
                  </span>{' '}
                  <span className={entry.action === 'error' ? 'text-red-300' : 'text-white/45'}>
                    {ACTION_LABEL[entry.action]}
                  </span>{' '}
                  {entry.detail && <span className="text-white/70">{entry.detail}</span>}
                </span>
                <span className="shrink-0 text-white/25">{timeAgo(entry.ts)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
