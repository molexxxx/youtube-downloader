import type { LoopMode, Track } from '@shared/types'

export interface QueueSnapshot {
  nowPlaying: Track | null
  queue: Track[]
  loop: LoopMode
}

/**
 * Pure per-guild track queue. Holds the current track plus the upcoming list and
 * encapsulates loop-aware advancement. Free of discord.js so it can be unit
 * tested directly; {@link GuildMusicPlayer} drives the actual voice playback.
 */
export class TrackQueue {
  private current: Track | null = null
  private items: Track[] = []
  loop: LoopMode = 'off'

  get nowPlaying(): Track | null {
    return this.current
  }

  get upcoming(): Track[] {
    return this.items
  }

  get isEmpty(): boolean {
    return this.current == null && this.items.length === 0
  }

  add(tracks: Track[]): void {
    this.items.push(...tracks)
  }

  /**
   * Move to the next track, honoring the loop mode, and return it (or null when
   * nothing remains). `skip` is set when the user explicitly skipped: it suppresses
   * the 'track' replay so a single-track loop doesn't trap the skip.
   */
  advance(skip = false): Track | null {
    if (this.loop === 'track' && !skip && this.current) {
      return this.current
    }
    if (this.loop === 'queue' && this.current) {
      this.items.push(this.current)
    }
    this.current = this.items.shift() ?? null
    return this.current
  }

  removeAt(index: number): Track | null {
    if (index < 0 || index >= this.items.length) return null
    return this.items.splice(index, 1)[0]
  }

  shuffle(): void {
    // Fisher-Yates over the upcoming items only; the current track is untouched.
    for (let i = this.items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.items[i], this.items[j]] = [this.items[j], this.items[i]]
    }
  }

  clear(): void {
    this.items = []
  }

  stop(): void {
    this.items = []
    this.current = null
  }

  snapshot(): QueueSnapshot {
    return { nowPlaying: this.current, queue: [...this.items], loop: this.loop }
  }
}
