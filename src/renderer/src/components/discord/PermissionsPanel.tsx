import { useEffect, useState } from 'react'
import type { GuildSettings } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { Select } from '../shared/Select'

/**
 * Per-server settings on the sheet: role gating and auto-leave. Playback
 * volume intentionally lives only in the player - it applies live and is
 * remembered per server.
 */
export function PermissionsPanel(): React.JSX.Element | null {
  const guild = useAppStore(
    (s) => s.discordGuilds.find((g) => g.id === s.activeGuildId) ?? null
  )
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
    { value: '', label: 'Anyone in the server' },
    ...guild.roles.map((r) => ({ value: r.id, label: r.name }))
  ]

  return (
    <div className="scroll-ink flex min-h-0 flex-1 flex-col overflow-y-auto pb-6 pl-6 pr-[14px] pt-5">
      <p className="truncate text-[13px] text-[var(--t-dim)]">{guild.name}</p>

      <div className="mt-4 border-t border-[var(--t-rule-strong)] pt-5">
        <p className="text-sm font-semibold">Who can use slash commands</p>
        <Select
          value={settings.allowedRoleId ?? ''}
          onChange={(value) => void update({ allowedRoleId: value || null })}
          options={roleOptions}
          accent="indigo"
          className="mt-2.5"
        />
        <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--t-dim)]">
          Gates /play, /skip and friends inside Discord. You always have full control from
          this app.
        </p>
      </div>

      <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 border-t border-[var(--t-rule)] pt-5">
        <span>
          <span className="block text-sm font-semibold">
            Leave voice when the queue ends
          </span>
          <span className="mt-1 block text-[13px] text-[var(--t-dim)]">
            Disconnects after a minute of silence.
          </span>
        </span>
        <input
          type="checkbox"
          checked={settings.autoLeaveOnEmpty}
          onChange={(e) => void update({ autoLeaveOnEmpty: e.target.checked })}
          className="toggle"
        />
      </label>
    </div>
  )
}
