import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Copy, Trash2 } from 'lucide-react'
import type { LogEntry } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

type Level = LogEntry['level']
const LEVELS: Level[] = ['debug', 'info', 'warn', 'error']

const LEVEL_STYLE: Record<Level, string> = {
  debug: 'text-[var(--t-dim)]',
  info: 'text-[var(--t-blue)]',
  warn: 'text-[var(--t-warn)]',
  error: 'text-[var(--t-red)]'
}

const LEVEL_MARK: Record<Level, string> = {
  debug: 'bg-[var(--t-dim)]',
  info: 'bg-[var(--t-blue)]',
  warn: 'bg-[var(--t-warn)]',
  error: 'bg-[var(--t-red)]'
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: false })
}

/** Live app log on the stage: level filters and tools above a recessed console well. */
export function LogsScreen(): React.JSX.Element {
  const logs = useAppStore((s) => s.logs)
  const setLogs = useAppStore((s) => s.setLogs)
  const [active, setActive] = useState<Set<Level>>(new Set(LEVELS))
  const [follow, setFollow] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => logs.filter((l) => active.has(l.level)), [logs, active])

  useEffect(() => {
    if (follow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visible, follow])

  const toggleLevel = (level: Level): void => {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      // Never allow an empty filter - fall back to showing everything.
      return next.size === 0 ? new Set(LEVELS) : next
    })
  }

  const copyAll = (): void => {
    const text = visible
      .map((l) => `[${formatTime(l.timestamp)}] ${l.level.toUpperCase()} ${l.message}`)
      .join('\n')
    void navigator.clipboard.writeText(text)
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-10 pb-8 pt-8">
      <div className="flex items-end justify-between gap-4 border-b border-[var(--t-rule-strong)] pb-4">
        <div>
          <h1 className="display text-[24px]">Logs</h1>
          <p className="mt-2 text-sm tabular-nums text-[var(--t-dim)]">
            {visible.length === logs.length
              ? `${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}`
              : `${visible.length} of ${logs.length} entries`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Levels"
            className="tape flex gap-0.5 rounded-sm p-1"
          >
            {LEVELS.map((level) => {
              const on = active.has(level)
              return (
                <button
                  key={level}
                  onClick={() => toggleLevel(level)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-sm px-2.5 py-1 text-[13px] font-semibold capitalize transition-colors ${
                    on
                      ? 'bg-[var(--w-stage)] text-[var(--t-fg)]'
                      : 'text-[var(--t-dim)] line-through hover:text-[var(--t-fg)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 ${on ? LEVEL_MARK[level] : 'bg-[var(--t-rule-strong)]'}`}
                  />
                  {level}
                </button>
              )
            })}
          </div>
          <span aria-hidden="true" className="mx-2 h-5 w-px bg-[var(--t-rule-strong)]" />
          <button
            onClick={() => setFollow((v) => !v)}
            title="Follow new logs"
            aria-pressed={follow}
            className="chip flex items-center gap-1.5 px-2.5 py-1.5 text-[13px]"
          >
            <ArrowDownToLine size={13} />
            Tail
          </button>
          <button
            onClick={copyAll}
            title="Copy visible logs"
            className="key key-line h-8 px-3 text-[13px]"
          >
            <Copy size={13} />
            Copy
          </button>
          <button
            onClick={() => setLogs([])}
            title="Clear the view"
            className="key key-line h-8 px-3 text-[13px] hover:text-[var(--t-red)]"
          >
            <Trash2 size={13} />
            Clear
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="floor selectable scroll-ink mt-6 min-h-0 flex-1 overflow-y-auto rounded-sm py-3 pl-4 pr-1.5 font-mono text-xs leading-relaxed"
      >
        {visible.length === 0 ? (
          <p className="text-[var(--t-faint)]">No log entries.</p>
        ) : (
          visible.map((entry, i) => (
            <div key={i} className="flex gap-3 whitespace-pre-wrap break-all">
              <span className="shrink-0 text-[var(--t-dim)]">
                {formatTime(entry.timestamp)}
              </span>
              <span className={`w-11 shrink-0 uppercase ${LEVEL_STYLE[entry.level]}`}>
                {entry.level}
              </span>
              <span className="text-[var(--t-fg)]">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
