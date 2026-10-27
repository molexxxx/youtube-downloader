import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, Sparkles, X } from 'lucide-react'
import {
  DEFAULT_AUDIO_EFFECTS,
  type AudioEffectMode,
  type AudioEffects
} from '@shared/types'
import { useAppStore } from '../../stores/appStore'

/**
 * One-tap starting points that set the speed / pitch / EQ sliders below (they
 * light up while the sliders match). Single-toggle effects like 8D or karaoke
 * live only in the Effect row, so nothing appears twice.
 */
const PRESETS: { id: string; label: string; effects: AudioEffects }[] = [
  {
    id: 'bassboost',
    label: 'Bass Boost',
    effects: { ...DEFAULT_AUDIO_EFFECTS, bassGain: 9, trebleGain: 2 }
  },
  {
    id: 'nightcore',
    label: 'Nightcore',
    effects: { ...DEFAULT_AUDIO_EFFECTS, speed: 1.25, pitch: 1.25 }
  },
  {
    id: 'vaporwave',
    label: 'Slowed',
    effects: { ...DEFAULT_AUDIO_EFFECTS, speed: 0.8, pitch: 0.85 }
  }
]

/** Whether the slider knobs currently match a preset (mode is independent). */
function presetMatches(preset: AudioEffects, current: AudioEffects): boolean {
  return (
    preset.speed === current.speed &&
    preset.pitch === current.pitch &&
    preset.bassGain === current.bassGain &&
    preset.midGain === current.midGain &&
    preset.trebleGain === current.trebleGain
  )
}

const MODES: { id: AudioEffectMode; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'tremolo', label: 'Tremolo' },
  { id: 'vibrato', label: 'Vibrato' },
  { id: 'rotate', label: '8D' },
  { id: 'echo', label: 'Echo' }
]

export function effectsAreActive(effects: AudioEffects | undefined): boolean {
  if (!effects) return false
  return (
    effects.speed !== 1 ||
    effects.pitch !== 1 ||
    effects.bassGain !== 0 ||
    effects.midGain !== 0 ||
    effects.trebleGain !== 0 ||
    effects.mode !== 'none'
  )
}

/** The active server's live effects from the player state. */
export function useGuildEffects(): AudioEffects {
  return useAppStore((s) =>
    s.activeGuildId
      ? (s.playerStates[s.activeGuildId]?.effects ?? DEFAULT_AUDIO_EFFECTS)
      : DEFAULT_AUDIO_EFFECTS
  )
}

/**
 * The effects editor sheet: presets, speed / pitch (timescale), a 3-band tone
 * EQ, and single-pick character effects (8D, karaoke, tremolo…). `wide` sets
 * tempo and the EQ side by side for the main window's popover; `stack` is the
 * single column used by the quick-actions window's overlay.
 */
export function EffectsPanel({
  onClose,
  layout = 'stack'
}: {
  onClose: () => void
  layout?: 'wide' | 'stack'
}): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const effects = useGuildEffects()
  // Local editing copy so sliders track the pointer; committed on release. The
  // ref mirrors it so a commit that fires in the same tick as the final change
  // (single click on a slider track) never sends a stale value.
  const [draft, setDraft] = useState<AudioEffects>(effects)
  const draftRef = useRef(draft)

  useEffect(() => {
    draftRef.current = effects
    setDraft(effects)
  }, [effects])

  if (!guildId) return null

  const active = effectsAreActive(effects)

  function commit(next: AudioEffects): void {
    draftRef.current = next
    setDraft(next)
    void window.api.discord.setEffects(guildId!, next)
  }

  function patch(partial: Partial<AudioEffects>): void {
    draftRef.current = { ...draftRef.current, ...partial }
    setDraft(draftRef.current)
  }

  function commitDraft(): void {
    void window.api.discord.setEffects(guildId!, draftRef.current)
  }

  const tempo = (
    <div>
      <GroupLabel label="Presets" note="set the sliders" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => commit({ ...preset.effects, mode: draft.mode })}
            aria-pressed={presetMatches(preset.effects, draft)}
            className="chip px-3 py-1.5 text-[13px]"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <EffectSlider
        label="Speed"
        value={draft.speed}
        display={`${draft.speed.toFixed(2)}×`}
        min={0.5}
        max={2}
        step={0.05}
        onChange={(speed) => patch({ speed })}
        onCommit={commitDraft}
      />
      <EffectSlider
        label="Pitch"
        value={draft.pitch}
        display={`${draft.pitch.toFixed(2)}×`}
        min={0.5}
        max={2}
        step={0.05}
        onChange={(pitch) => patch({ pitch })}
        onCommit={commitDraft}
      />
    </div>
  )

  const equalizer = (
    <div>
      <GroupLabel label="Equalizer" />
      <EffectSlider
        label="Bass"
        value={draft.bassGain}
        display={`${draft.bassGain > 0 ? '+' : ''}${draft.bassGain} dB`}
        min={-12}
        max={12}
        step={1}
        onChange={(bassGain) => patch({ bassGain })}
        onCommit={commitDraft}
      />
      <EffectSlider
        label="Mid"
        value={draft.midGain}
        display={`${draft.midGain > 0 ? '+' : ''}${draft.midGain} dB`}
        min={-12}
        max={12}
        step={1}
        onChange={(midGain) => patch({ midGain })}
        onCommit={commitDraft}
      />
      <EffectSlider
        label="Treble"
        value={draft.trebleGain}
        display={`${draft.trebleGain > 0 ? '+' : ''}${draft.trebleGain} dB`}
        min={-12}
        max={12}
        step={1}
        onChange={(trebleGain) => patch({ trebleGain })}
        onCommit={commitDraft}
      />
    </div>
  )

  return (
    <div className="sheet scroll-ink max-h-full min-h-0 overflow-y-auto rounded-sm border border-[var(--t-rule-strong)] py-5 pl-5 pr-2.5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-3">
        <h4 className="display text-base">Audio effects</h4>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => commit(DEFAULT_AUDIO_EFFECTS)}
            disabled={!active}
            title="Reset all effects"
            className="flex items-center gap-1 text-[13px] text-[var(--t-dim)] transition-colors hover:text-[var(--t-fg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={13} />
            Reset
          </button>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close effects"
            className="rounded-sm p-1 text-[var(--t-dim)] transition-colors hover:bg-[var(--t-hover)] hover:text-[var(--t-fg)]"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {layout === 'wide' ? (
        <div className="grid grid-cols-2 gap-x-8">
          {tempo}
          {equalizer}
        </div>
      ) : (
        <>
          {tempo}
          {equalizer}
        </>
      )}

      <GroupLabel label="Effect" note="pick one" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => commit({ ...draft, mode: mode.id })}
            aria-pressed={draft.mode === mode.id}
            className="chip px-3 py-1.5 text-[13px]"
          >
            {mode.label}
          </button>
        ))}
      </div>

      <p className="mt-4 border-t border-[var(--t-rule)] pt-3 text-xs leading-relaxed text-[var(--t-dim)]">
        Changes re-render the stream, so playback restarts at the current position with
        the new sound.
      </p>
    </div>
  )
}

function GroupLabel({
  label,
  note
}: {
  label: string
  note?: string
}): React.JSX.Element {
  return (
    <p className="mt-4 border-t border-[var(--t-rule)] pt-3 text-[13px] font-semibold">
      {label}
      {note && <span className="ml-2 font-normal text-[var(--t-dim)]">{note}</span>}
    </p>
  )
}

const PANEL_WIDTH = 580
const EDGE_MARGIN = 16
const PANEL_GAP = 10

/** Viewport-fixed geometry for the open effects sheet, measured from its trigger. */
interface PanelPlacement {
  left: number
  maxHeight: number
  top?: number
  bottom?: number
}

/**
 * Effects trigger + anchored sheet for the main window's player. The sheet
 * renders in a portal at a fixed position inside the stage that holds the
 * trigger, on whichever side of the trigger has more room, so it never covers
 * the title bar or the sheet beside the stage.
 */
export function EffectsPopover(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const effects = useGuildEffects()
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<PanelPlacement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    function measure(): void {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const stage = el.closest('.stage')?.getBoundingClientRect()
      const bounds = {
        top: (stage?.top ?? 0) + EDGE_MARGIN,
        bottom: (stage?.bottom ?? window.innerHeight) - EDGE_MARGIN,
        left: (stage?.left ?? 0) + EDGE_MARGIN,
        right: (stage?.right ?? window.innerWidth) - EDGE_MARGIN
      }
      const below = bounds.bottom - rect.bottom - PANEL_GAP
      const above = rect.top - bounds.top - PANEL_GAP
      const left = Math.max(bounds.left, Math.min(rect.left, bounds.right - PANEL_WIDTH))
      setPlacement(
        above > below
          ? { left, maxHeight: above, bottom: window.innerHeight - rect.top + PANEL_GAP }
          : { left, maxHeight: below, top: rect.bottom + PANEL_GAP }
      )
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!guildId) return null

  const active = effectsAreActive(effects)

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Audio effects (EQ, speed, filters)"
        aria-label="Audio effects"
        aria-expanded={open}
        className={`key key-line relative h-11 w-11 ${
          open || active ? 'border-[var(--w-blue)] text-[var(--t-blue)]' : ''
        }`}
      >
        <Sparkles size={16} />
        {active && (
          <span
            aria-label="Effects active"
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--w-blue)] ring-2 ring-[var(--t-ring)]"
          />
        )}
      </button>

      {open &&
        placement &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', width: PANEL_WIDTH, ...placement }}
            className="focus-ring-indigo signal-blue z-[60] flex flex-col"
          >
            <EffectsPanel layout="wide" onClose={() => setOpen(false)} />
          </div>,
          document.body
        )}
    </div>
  )
}

function EffectSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  onCommit
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  onCommit: () => void
}): React.JSX.Element {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className="w-12 shrink-0 text-[13px] text-[var(--t-dim)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={(e) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && onCommit()}
        aria-label={label}
        className="line-range line-range-thin min-w-0 flex-1"
        style={{
          background: `linear-gradient(90deg, var(--t-accent) ${pct}%, var(--t-rule-strong) ${pct}%)`
        }}
      />
      <span className="w-14 shrink-0 text-right text-[13px] tabular-nums">{display}</span>
    </div>
  )
}
