import { useState } from 'react'
import {
  Bot,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Plug,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { DiscordAmbient } from './DiscordAmbient'

const PORTAL_URL = 'https://discord.com/developers/applications'

const STEPS = [
  {
    title: 'Open the Discord Developer Portal',
    body: 'Sign in with the Discord account you already use - creating a bot is free, no separate developer account needed.',
    link: { label: 'discord.com/developers', url: PORTAL_URL }
  },
  {
    title: 'Create an application',
    body: 'Hit "New Application" (top right), give it any name - that becomes your bot\'s name - and press Create. A bot user is created with it automatically.'
  },
  {
    title: 'Reveal the token',
    body: 'Open the "Bot" tab in the left sidebar, then press "Reset Token" and confirm (Discord may ask for a 2FA code). Copy it right away - it\'s only shown once.'
  },
  {
    title: 'Paste it here and connect',
    body: 'The token is encrypted with your OS keychain and never leaves this machine. Then use Invite to add the bot to a server you manage.'
  }
] as const

/**
 * Token entry + connection management, shown whenever the bot is not connected.
 * The token is sent to the main process once and stored encrypted locally; it is
 * never read back into the UI.
 */
export function DiscordSetup(): React.JSX.Element {
  const status = useAppStore((s) => s.discordStatus)
  const setDiscordStatus = useAppStore((s) => s.setDiscordStatus)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)

  const connecting = status?.state === 'connecting' || busy
  const hasToken = Boolean(status?.hasToken)

  async function connectWithToken(): Promise<void> {
    if (!token.trim()) return
    setBusy(true)
    try {
      setDiscordStatus(await window.api.discord.setToken(token.trim()))
      setToken('')
    } finally {
      setBusy(false)
    }
  }

  async function reconnect(): Promise<void> {
    setBusy(true)
    try {
      setDiscordStatus(await window.api.discord.connect())
    } finally {
      setBusy(false)
    }
  }

  async function clear(): Promise<void> {
    setBusy(true)
    try {
      setDiscordStatus(await window.api.discord.clearToken())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl">
      <DiscordAmbient />
      <div className="scroll-thin-indigo relative mx-auto flex w-full max-w-2xl flex-col gap-5 overflow-y-auto px-1 py-6">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
            <Bot size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Your own Discord music bot</h2>
            <p className="text-sm text-white/50">
              Self-hosted on this machine - no subscriptions, no premium tiers, no limits.
            </p>
          </div>
        </div>

        {status?.state === 'error' && status.error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm text-red-300">
            Connection failed: {status.error}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm">
          <label
            htmlFor="bot-token"
            className="text-xs font-medium uppercase tracking-wide text-white/40"
          >
            Bot token
          </label>
          <div className="field field-indigo flex items-center gap-2.5 px-3.5 py-2.5">
            <KeyRound size={16} className="shrink-0 text-white/40" />
            <input
              id="bot-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void connectWithToken()}
              placeholder={
                hasToken
                  ? 'A token is saved - paste a new one to replace it'
                  : 'Paste your bot token - stored encrypted, never shared'
              }
              spellCheck={false}
              autoComplete="off"
              className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => void connectWithToken()}
              disabled={connecting || !token.trim()}
              className="btn btn-indigo px-4 py-2 text-sm"
            >
              {connecting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Plug size={15} />
              )}
              {hasToken ? 'Save & connect' : 'Connect'}
            </button>
            {hasToken && (
              <>
                <button
                  onClick={() => void reconnect()}
                  disabled={connecting}
                  className="btn btn-ghost px-4 py-2 text-sm"
                >
                  <RotateCcw size={14} />
                  Reconnect saved token
                </button>
                <button
                  onClick={() => void clear()}
                  disabled={connecting}
                  className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/50 transition-colors hover:border-red-500/40 hover:text-red-300 disabled:opacity-40"
                  title="Forget the saved token"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm">
          <p className="text-sm font-medium text-white/75">
            Get a token in about a minute
          </p>
          <ol className="mt-3 flex flex-col gap-2.5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-white/80">
                    {step.title}
                    {'link' in step && step.link && (
                      <button
                        onClick={() => void window.api.system.openExternal(step.link.url)}
                        className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-indigo-300 hover:underline"
                      >
                        {step.link.label} <ExternalLink size={11} />
                      </button>
                    )}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-white/45">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-500/5 px-3 py-2 text-[11px] leading-relaxed text-white/40">
            <Link2 size={12} className="mt-0.5 shrink-0 text-indigo-300/70" />
            Resetting the token signs out anything using the old one, and Discord never
            shows a token twice - if you lose it, just reset again.
          </p>
        </div>
      </div>
    </div>
  )
}
