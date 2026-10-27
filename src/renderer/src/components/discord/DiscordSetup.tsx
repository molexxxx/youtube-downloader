import { useState } from 'react'
import {
  AlertCircle,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Plug,
  RotateCcw,
  Trash2
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

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
 * Token entry and connection management, shown whenever the bot is not
 * connected: the token on the stage, the numbered how-to on the sheet. The
 * token is sent to the main process once and stored encrypted locally; it is
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
    <div className="focus-ring-indigo signal-blue flex min-h-0 flex-1 overflow-hidden">
      <section className="stage scroll-ink flex min-w-0 flex-1 flex-col justify-center overflow-y-auto py-10 pl-14 pr-[46px]">
        <div className="max-w-xl">
          <h2 className="display text-[30px]">Your own Discord music bot</h2>
          <p className="mt-4 text-[15px] text-[var(--t-dim)]">
            Self-hosted on this machine - no subscriptions, no premium tiers, no limits.
          </p>

          {status?.state === 'error' && status.error && (
            <p
              role="alert"
              className="mt-6 flex items-start gap-2 text-sm text-[var(--t-red)]"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span className="selectable">Connection failed: {status.error}</span>
            </p>
          )}

          <label htmlFor="bot-token" className="mt-10 block text-sm font-semibold">
            Bot token
          </label>
          <div className="mt-3 flex items-end gap-3">
            <div className="line-field line-field-blue flex-1 pb-3">
              <KeyRound size={18} className="shrink-0 text-[var(--t-faint)]" />
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
                className="min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </div>
            <button
              onClick={() => void connectWithToken()}
              disabled={connecting || !token.trim()}
              className="key key-blue h-11 shrink-0 px-5 text-sm"
            >
              {connecting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plug size={16} />
              )}
              {hasToken ? 'Save & connect' : 'Connect'}
            </button>
          </div>

          {hasToken && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={() => void reconnect()}
                disabled={connecting}
                className="key key-line h-10 px-4 text-sm"
              >
                <RotateCcw size={15} />
                Reconnect saved token
              </button>
              <button
                onClick={() => void clear()}
                disabled={connecting}
                title="Forget the saved token"
                className="key key-line h-10 px-4 text-sm hover:text-[var(--t-red)]"
              >
                <Trash2 size={15} />
                Forget token
              </button>
            </div>
          )}
        </div>
      </section>

      <aside className="sheet scroll-ink flex w-[460px] shrink-0 flex-col overflow-y-auto border-l border-[var(--t-rule)] py-8 pl-8 pr-[22px]">
        <h3 className="display text-lg">Get a token in about a minute</h3>
        <ol className="mt-6 border-t border-[var(--t-rule-strong)]">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-b border-[var(--t-rule)] py-4"
            >
              <span className="numeral pt-1.5 text-[15px] text-[var(--t-blue)]">
                {i + 1}
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-[15px] font-semibold">{step.title}</p>
                {'link' in step && step.link && (
                  <button
                    onClick={() => void window.api.system.openExternal(step.link.url)}
                    className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--t-blue)] hover:underline"
                  >
                    {step.link.label} <ExternalLink size={12} />
                  </button>
                )}
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--t-dim)]">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed text-[var(--t-dim)]">
          <Link2 size={14} className="mt-0.5 shrink-0" />
          Resetting the token signs out anything using the old one, and Discord never
          shows a token twice - if you lose it, just reset again.
        </p>
      </aside>
    </div>
  )
}
