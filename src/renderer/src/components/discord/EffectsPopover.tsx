import { useEffect, useRef, useState } from 'react'
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
 * The effects editor card: presets, speed / pitch (timescale), a 3-band tone
 * EQ, and single-pick character effects (8D, karaoke, tremolo…). Shared by the
 * main window's anchored popover and the quick-actions window's overlay.
 */
export function EffectsPanel({
  onClose
}: {
  onClose: () => void
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

  return (
    <div className="rounded-xl border border-white/10 bg-[#12151c]/95 p-3.5 shadow-2xl shadow-black/50 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-indigo-300" />
        <h4 className="text-xs font-semibold text-white/85">Audio effects</h4>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => commit(DEFAULT_AUDIO_EFFECTS)}
            disabled={!active}
            title="Reset all effects"
            className="flex items-center gap-1 text-[11px] text-white/45 transition-colors hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={11} />
            Reset
          </button>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close effects"
            className="rounded p-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-white/35">
        Presets
        <span className="ml-1.5 font-normal normal-case tracking-normal text-white/25">
          set the sliders below
        </span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const selected = presetMatches(preset.effects, draft)
          return (
            <button
              key={preset.id}
              onClick={() => commit({ ...preset.effects, mode: draft.mode })}
              aria-pressed={selected}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-all duration-150 ${
                selected
                  ? 'border-indigo-500/50 bg-gradient-to-b from-indigo-500/20 to-indigo-500/5 text-indigo-200 shadow-[0_0_12px_-2px_rgba(99,102,241,0.35)]'
                  : 'border-white/10 text-white/55 hover:border-indigo-400/50 hover:text-indigo-200'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
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

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-white/35">
        Equalizer
      </p>
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

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-white/35">
        Effect
        <span className="ml-1.5 font-normal normal-case tracking-normal text-white/25">
          pick one
        </span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => commit({ ...draft, mode: mode.id })}
            aria-pressed={draft.mode === mode.id}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-all duration-150 ${
              draft.mode === mode.id
                ? 'border-indigo-500/50 bg-gradient-to-b from-indigo-500/20 to-indigo-500/5 text-indigo-200 shadow-[0_0_12px_-2px_rgba(99,102,241,0.35)]'
                : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-white/30">
        Changes re-render the stream, so playback restarts at the current position with
        the new sound.
      </p>
    </div>
  )
}

/** Effects trigger + anchored dropdown for the main window's player panel. */
export function EffectsPopover(): React.JSX.Element | null {
  const guildId = useAppStore((s) => s.activeGuildId)
  const effects = useGuildEffects()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
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
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-all ${
          open || active
            ? 'bg-indigo-500/20 text-indigo-300'
            : 'text-white/65 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Sparkles size={15} />
        {active && (
          <span
            aria-label="Effects active"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-indigo-400 ring-2 ring-[#0b0d12]"
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80">
          <EffectsPanel onClose={() => setOpen(false)} />
        </div>
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
    <div className="mt-2 flex items-center gap-2.5">
      <span className="w-11 shrink-0 text-[11px] text-white/50">{label}</span>
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
        className="slider flex-1"
        style={{
          background: `linear-gradient(90deg, rgba(129,140,248,0.9) ${pct}%, rgba(255,255,255,0.10) ${pct}%)`
        }}
      />
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-white/60">
        {display}
      </span>
    </div>
  )
}
