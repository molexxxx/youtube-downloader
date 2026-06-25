import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import type { GuildSettings } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { Select } from '../shared/Select'

/** Per-server settings: role gating, default volume, and auto-leave. */
export function PermissionsPanel(): React.JSX.Element | null {
  const guild = useAppStore((s) => s.discordGuilds.find((g) => g.id === s.activeGuildId) ?? null)
  const guildId = guild?.id
  const [settings, setSettings] = useState<GuildSettings | null>(null)

  useEffect(() => {
    if (!guildId) return
    void window.api.discord.getSettings(guildId).then(setSettings)
  }, [guildId])

  if (!guild || !settings) return null

  async function update(partial: Partial<GuildSettings>): Promise<void> {
    if (!guild) return
    setSettings(await window.api.discord.setSettings(guild.id, partial))
  }

  const roleOptions = [
    { value: '', label: 'Anyone can control playback' },
    ...guild.roles.map((r) => ({ value: r.id, label: r.name }))
  ]

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/40">
        <Shield size={14} />
        Server settings
      </h3>

      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-white/50">Restrict commands to role</label>
          <Select
            value={settings.allowedRoleId ?? ''}
            onChange={(value) => void update({ allowedRoleId: value || null })}
            options={roleOptions}
          />
          <p className="mt-1 text-[11px] text-white/30">
            Only affects Discord slash commands - the app always controls playback.
          </p>
        </div>

        <div>
          <label className="mb-1 flex items-center justify-between text-xs text-white/50">
            <span>Default volume</span>
            <span className="tabular-nums text-white/40">{settings.defaultVolume}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={settings.defaultVolume}
            onChange={(e) =>
              setSettings((s) => (s ? { ...s, defaultVolume: Number(e.target.value) } : s))
            }
            onPointerUp={() => void update({ defaultVolume: settings.defaultVolume })}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-indigo-500"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between text-xs text-white/60">
          <span>Auto-leave when idle</span>
          <input
            type="checkbox"
            checked={settings.autoLeaveOnEmpty}
            onChange={(e) => void update({ autoLeaveOnEmpty: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-indigo-500"
          />
        </label>
      </div>
    </section>
  )
}
