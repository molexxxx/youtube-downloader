import { describe, expect, it } from 'vitest'
import type { Track, TrackRequester } from '@shared/types'
import { TrackQueue } from '@main/discord/queue'

const REQUESTER: TrackRequester = { source: 'ui', userId: null, username: 'You' }

function track(id: string): Track {
  return {
    id,
    title: id,
    url: `https://x/${id}`,
    duration: null,
    thumbnail: null,
    requestedBy: REQUESTER,
    addedAt: 0
  }
}

describe('TrackQueue', () => {
  it('advances through queued tracks in order', () => {
    const q = new TrackQueue()
    q.add([track('a'), track('b')])
    expect(q.advance()?.id).toBe('a')
    expect(q.nowPlaying?.id).toBe('a')
    expect(q.advance()?.id).toBe('b')
    expect(q.advance()).toBeNull()
    expect(q.isEmpty).toBe(true)
  })

  it("loop 'track' replays the current track until skipped", () => {
    const q = new TrackQueue()
    q.add([track('a'), track('b')])
    q.advance()
    q.loop = 'track'
    expect(q.advance()?.id).toBe('a')
    expect(q.advance()?.id).toBe('a')
    // An explicit skip ignores the single-track loop and moves on.
    expect(q.advance(true)?.id).toBe('b')
  })

  it("loop 'queue' recycles finished tracks to the back", () => {
    const q = new TrackQueue()
    q.add([track('a'), track('b')])
    q.loop = 'queue'
    expect(q.advance()?.id).toBe('a')
    expect(q.advance()?.id).toBe('b')
    // 'a' was pushed to the back when it finished, so it comes around again.
    expect(q.advance()?.id).toBe('a')
  })

  it('removes upcoming tracks by index', () => {
    const q = new TrackQueue()
    q.add([track('a'), track('b'), track('c')])
    expect(q.removeAt(1)?.id).toBe('b')
    expect(q.upcoming.map((t) => t.id)).toEqual(['a', 'c'])
    expect(q.removeAt(5)).toBeNull()
  })

  it('clear empties the queue but keeps the current track', () => {
    const q = new TrackQueue()
    q.add([track('a'), track('b')])
    q.advance()
    q.clear()
    expect(q.upcoming).toHaveLength(0)
    expect(q.nowPlaying?.id).toBe('a')
  })

  it('stop drops the current track and the queue', () => {
    const q = new TrackQueue()
    q.add([track('a'), track('b')])
    q.advance()
    q.stop()
    expect(q.isEmpty).toBe(true)
    expect(q.nowPlaying).toBeNull()
  })

  it('shuffle keeps the same set of upcoming tracks', () => {
    const q = new TrackQueue()
    const ids = ['a', 'b', 'c', 'd', 'e']
    q.add(ids.map(track))
    q.shuffle()
    expect([...q.upcoming.map((t) => t.id)].sort()).toEqual([...ids].sort())
  })
})
