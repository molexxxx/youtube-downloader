import { useState } from 'react'
import { Bot, ExternalLink, KeyRound, Loader2, Plug, Trash2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

/**
 * Token entry + connection management. Shown whenever the bot is not connected.
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
          <Bot size={22} />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Discord music bot</h2>
          <p className="text-sm text-white/50">
            Host a personal bot that plays YouTube audio in your voice channels.
          </p>
        </div>
      </div>

      {status?.state === 'error' && status.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2.5 text-sm text-red-300">
          Connection failed: {status.error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <label className="text-xs font-medium uppercase tracking-wide text-white/40">
          Bot token
        </label>
        <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-[#12151c] px-3 py-2.5 focus-within:border-indigo-500/50">
          <KeyRound size={16} className="shrink-0 text-white/40" />
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void connectWithToken()}
            placeholder={hasToken ? 'A token is saved - paste a new one to replace it' : 'Paste your bot token'}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
          />
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => void connectWithToken()}
            disabled={connecting || !token.trim()}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {connecting ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />}
            {hasToken ? 'Save & connect' : 'Connect'}
          </button>
          {hasToken && (
            <>
              <button
                onClick={() => void reconnect()}
                disabled={connecting}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
              >
                Reconnect saved token
              </button>
              <button
                onClick={() => void clear()}
                disabled={connecting}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/50 transition-colors hover:border-red-500/40 hover:text-red-300 disabled:opacity-40"
                title="Forget the saved token"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/55">
        <p className="font-medium text-white/75">How to get a token</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">
          <li>
            Open the{' '}
            <button
              onClick={() =>
                void window.api.system.openExternal('https://discord.com/developers/applications')
              }
              className="inline-flex items-center gap-1 text-indigo-300 hover:underline"
            >
              Discord Developer Portal <ExternalLink size={12} />
            </button>{' '}
            and create an application.
          </li>
          <li>Under Bot, add a bot and copy its token.</li>
          <li>Paste the token above and connect, then use Invite to add it to a server.</li>
        </ol>
      </div>
    </div>
  )
}
