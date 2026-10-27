/**
 * The FFmpeg audio filter chain for Discord playback effects. Pure, with no voice or Electron dependency, so the
 * FFmpeg self-test runs the exact chain playback builds.
 */
import { DEFAULT_AUDIO_EFFECTS, type AudioEffects } from '@shared/types'

/** Discord voice sample rate; the pitch shifter resamples back to this. */
export const SAMPLE_RATE = 48_000

/** Fixed parameters for the mutually exclusive character effects. Frequencies
 * and depths follow ffmpeg defaults and Lavalink's Discord-bot conventions
 * (tremolo/vibrato ~depth 0.5, rotation a slow 0.15 Hz stereo sweep). */
export const EFFECT_FILTERS: Record<Exclude<AudioEffects['mode'], 'none'>, string> = {
  tremolo: 'tremolo=f=4:d=0.6',
  vibrato: 'vibrato=f=5:d=0.5',
  rotate: 'apulsator=hz=0.15',
  // Out-of-phase channel subtraction cancels center-panned vocals.
  karaoke: 'pan=stereo|c0=0.6*c0+-0.6*c1|c1=0.6*c1+-0.6*c0',
  echo: 'aecho=0.8:0.55:220:0.35'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Sanitize renderer-supplied effects: clamp knobs, drop unknown modes. */
export function sanitizeEffects(effects: Partial<AudioEffects> | null): AudioEffects {
  const base = { ...DEFAULT_AUDIO_EFFECTS, ...effects }
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return {
    speed: clamp(num(base.speed, 1), 0.5, 2),
    pitch: clamp(num(base.pitch, 1), 0.5, 2),
    bassGain: clamp(num(base.bassGain, 0), -12, 12),
    midGain: clamp(num(base.midGain, 0), -12, 12),
    trebleGain: clamp(num(base.trebleGain, 0), -12, 12),
    mode: base.mode in EFFECT_FILTERS ? base.mode : 'none'
  }
}

export function effectsActive(effects: AudioEffects): boolean {
  return (
    effects.speed !== 1 ||
    effects.pitch !== 1 ||
    effects.bassGain !== 0 ||
    effects.midGain !== 0 ||
    effects.trebleGain !== 0 ||
    effects.mode !== 'none'
  )
}

/**
 * atempo takes 0.5-100, but above 2 it skips samples instead of blending them,
 * so (as the FFmpeg docs advise) a correction outside 0.5-2 is daisy-chained.
 */
function atempoChain(factor: number): string[] {
  if (Math.abs(factor - 1) < 1e-3) return []
  if (factor >= 0.5 && factor <= 2) return [`atempo=${factor.toFixed(4)}`]
  const half = Math.sqrt(factor)
  return [`atempo=${half.toFixed(4)}`, `atempo=${half.toFixed(4)}`]
}

/**
 * ffmpeg `-af` chain for the given effects, or null when everything is at its
 * default. Pure function - unit tested. Order: pitch -> tempo compensation ->
 * tone (bass/mid/treble) -> character effect -> limiter (only when boosting,
 * to keep s16 output from clipping).
 *
 * asetrate relabels the rate without touching samples, so the input is first
 * resampled to 48kHz; on 44.1kHz sources (m4a, most local files) the shift
 * would otherwise come out 8.8% sharp and fast. alimiter normalizes its output
 * back to 0 dBFS unless `level` is disabled, which would undo the headroom.
 */
export function buildAudioFilterChain(effects: AudioEffects): string | null {
  const fx = sanitizeEffects(effects)
  if (!effectsActive(fx)) return null

  const chain: string[] = []
  if (fx.pitch !== 1) {
    chain.push(
      `aresample=${SAMPLE_RATE}`,
      `asetrate=${Math.round(SAMPLE_RATE * fx.pitch)}`,
      `aresample=${SAMPLE_RATE}`
    )
  }
  // asetrate already scales tempo by `pitch`; atempo covers the remainder so
  // the perceived speed always equals `speed` regardless of pitch.
  chain.push(...atempoChain(fx.speed / fx.pitch))
  if (fx.bassGain !== 0) chain.push(`bass=g=${fx.bassGain}`)
  if (fx.midGain !== 0) chain.push(`equalizer=f=1000:t=q:w=1:g=${fx.midGain}`)
  if (fx.trebleGain !== 0) chain.push(`treble=g=${fx.trebleGain}`)
  if (fx.mode !== 'none') chain.push(EFFECT_FILTERS[fx.mode])
  if (fx.bassGain > 0 || fx.midGain > 0 || fx.trebleGain > 0) {
    chain.push('alimiter=limit=0.97:level=disabled:latency=1')
  }
  return chain.length > 0 ? chain.join(',') : null
}
