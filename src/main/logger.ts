import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { LogEntry } from '@shared/types'

type Listener = (entry: LogEntry) => void

const RING_SIZE = 500
const ring: LogEntry[] = []
const listeners = new Set<Listener>()

let logFile: string | null = null

function ensureLogFile(): string {
  if (logFile) return logFile
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  logFile = join(dir, 'app.log')
  return logFile
}

function write(level: LogEntry['level'], parts: unknown[]): void {
  const message = parts
    .map((p) => (typeof p === 'string' ? p : safeStringify(p)))
    .join(' ')
  const entry: LogEntry = { level, message, timestamp: Date.now() }

  ring.push(entry)
  if (ring.length > RING_SIZE) ring.shift()

  const line = `[${new Date(entry.timestamp).toISOString()}] ${level.toUpperCase()} ${message}\n`
  console[level === 'debug' ? 'log' : level](line.trimEnd())

  try {
    appendFileSync(ensureLogFile(), line)
  } catch {
    // logging must never throw
  }

  for (const listener of listeners) listener(entry)
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const logger = {
  info: (...parts: unknown[]) => write('info', parts),
  warn: (...parts: unknown[]) => write('warn', parts),
  error: (...parts: unknown[]) => write('error', parts),
  debug: (...parts: unknown[]) => write('debug', parts),
  history: (): LogEntry[] => [...ring],
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}
