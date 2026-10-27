import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '@shared/types'

class FakeChild extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  stdin = new PassThrough()
  pid = 1
  kill = vi.fn(() => true)
}

interface Spawned {
  cmd: string
  args: string[]
  child: FakeChild
}

const { spawned, spawnMock, createAudioResourceMock } = vi.hoisted(() => {
  const spawned: Spawned[] = []
  return {
    spawned,
    spawnMock: vi.fn(),
    createAudioResourceMock: vi.fn(() => ({}))
  }
})

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, default: { ...actual, spawn: spawnMock }, spawn: spawnMock }
})
vi.mock('@discordjs/voice', () => ({
  createAudioResource: createAudioResourceMock,
  StreamType: { Raw: 'raw' }
}))
vi.mock('@main/config', () => ({ getConfig: () => ({}) }))
vi.mock('@main/binaries/ffmpeg-binary', () => ({ ffmpegPath: () => '/bin/ffmpeg' }))
vi.mock('@main/binaries/ytdlp-binary', () => ({
  ytdlpPath: () => '/bin/yt-dlp',
  trackYtdlp: <T>(child: T): T => child,
  ytdlpRuntimeArgs: () => ['--js-runtimes', 'node:/electron'],
  ytdlpEnv: () => ({ ELECTRON_RUN_AS_NODE: '1' })
}))
vi.mock('@main/ytdlp/cookies', () => ({
  cookieArgs: () => [],
  cookiesEnabled: () => false,
  isAuthRequiredError: () => false
}))
vi.mock('@main/discord/windows-tuning', () => ({ boostProcessPriority: vi.fn() }))

import { createTrackResource } from '@main/discord/audio'

const TRACK = {
  id: 't1',
  url: 'https://www.youtube.com/watch?v=abc',
  title: 'Wings of a Butterfly',
  duration: 260
} as Track

/** Lets queued stream events (`end`, `finish`) run, as they would between process events. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Starts a mid-track restart and returns the shared output plus the resolved direct ffmpeg. */
async function startRestart(): Promise<{ output: PassThrough; direct: FakeChild }> {
  createTrackResource(TRACK, 120)
  const output = (
    createAudioResourceMock.mock.calls.at(-1) as unknown[]
  )[0] as PassThrough
  const resolver = spawned[0]
  expect(resolver.cmd).toBe('/bin/yt-dlp')
  expect(resolver.args).toContain('--print')
  resolver.child.stdout.end('https://cdn.example/audio\n')
  resolver.child.emit('close', 0)
  const direct = spawned[1]
  expect(direct.cmd).toBe('/bin/ffmpeg')
  expect(direct.args).toContain('https://cdn.example/audio')
  return { output, direct: direct.child }
}

beforeEach(() => {
  spawned.length = 0
  createAudioResourceMock.mockClear()
  spawnMock.mockImplementation((cmd: string, args: string[]) => {
    const child = new FakeChild()
    spawned.push({ cmd, args, child })
    return child
  })
})

describe('createTrackResource mid-track restart', () => {
  it('keeps the output open and falls back to the piped stream when the direct URL yields no audio', async () => {
    const { output, direct } = await startRestart()

    direct.stdout.end()
    await settle()
    direct.stderr.write('HTTP error 403 Forbidden\n')
    direct.emit('close', 1)
    await settle()

    expect(output.writableEnded).toBe(false)
    expect(spawned.map((s) => s.cmd)).toEqual([
      '/bin/yt-dlp',
      '/bin/ffmpeg',
      '/bin/yt-dlp',
      '/bin/ffmpeg'
    ])
    expect(spawned[3].args).toContain('pipe:0')

    spawned[3].child.stdout.write(Buffer.alloc(48_000 * 4 * 3))
    await settle()
    expect(output.readableLength).toBeGreaterThan(0)
  })

  it('ends the output when the direct stream exits cleanly without audio', async () => {
    const { output, direct } = await startRestart()

    direct.stdout.end()
    await settle()
    direct.emit('close', 0)
    await settle()

    expect(output.writableEnded).toBe(true)
    expect(spawned).toHaveLength(2)
  })
})
