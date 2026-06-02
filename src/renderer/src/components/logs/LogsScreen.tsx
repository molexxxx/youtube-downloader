import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Copy, Trash2 } from 'lucide-react'
import type { LogEntry } from '@shared/types'
import { useAppStore } from '../../stores/appStore'

type Level = LogEntry['level']
const LEVELS: Level[] = ['debug', 'info', 'warn', 'error']

const LEVEL_STYLE: Record<Level, string> = {
  debug: 'text-white/40',
  info: 'text-sky-300',
  warn: 'text-amber-300',
  error: 'text-red-300'
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: false })
}

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
      // Never allow an empty filter — fall back to showing everything.
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
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Logs</h1>
        <div className="flex items-center gap-1.5">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${
                active.has(level)
                  ? 'bg-white/10 text-white'
                  : 'text-white/35 hover:text-white/60'
              }`}
            >
              {level}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button
            onClick={() => setFollow((v) => !v)}
            title="Follow new logs"
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
              follow ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <ArrowDownToLine size={13} />
            Tail
          </button>
          <button
            onClick={copyAll}
            title="Copy visible logs"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/40 hover:text-white/70"
          >
            <Copy size={13} />
            Copy
          </button>
          <button
            onClick={() => setLogs([])}
            title="Clear the view"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/40 hover:text-red-300"
          >
            <Trash2 size={13} />
            Clear
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-3 font-mono text-xs leading-relaxed"
      >
        {visible.length === 0 ? (
          <p className="text-white/30">No log entries.</p>
        ) : (
          visible.map((entry, i) => (
            <div key={i} className="flex gap-2 whitespace-pre-wrap break-all">
              <span className="shrink-0 text-white/30">{formatTime(entry.timestamp)}</span>
              <span className={`shrink-0 uppercase ${LEVEL_STYLE[entry.level]}`}>
                {entry.level}
              </span>
              <span className="text-white/75">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
