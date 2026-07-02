import { useEffect, useState } from 'react'
import type { GuildSettings } from '@shared/types'
import { useAppStore } from '../../stores/appStore'
import { Select } from '../shared/Select'

/**
 * Per-server settings: role gating and auto-leave. Rendered inside the sidebar
 * tabs, so it draws no card chrome of its own. Playback volume intentionally
 * lives only in the player - it applies live and is remembered per server.
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
    <div className="flex flex-col gap-4 p-3.5">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-white/60">
          Who can use slash commands
        </label>
        <Select
          value={settings.allowedRoleId ?? ''}
          onChange={(value) => void update({ allowedRoleId: value || null })}
          options={roleOptions}
          accent="indigo"
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/30">
          Gates /play, /skip and friends inside Discord. You always have full control from
          this app.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-xs font-medium text-white/60">
          Leave voice when the queue ends
          <span className="mt-0.5 block font-normal text-white/30">
            Disconnects after a minute of silence.
          </span>
        </span>
        <input
          type="checkbox"
          checked={settings.autoLeaveOnEmpty}
          onChange={(e) => void update({ autoLeaveOnEmpty: e.target.checked })}
          className="switch shrink-0"
        />
      </label>
    </div>
  )
}
