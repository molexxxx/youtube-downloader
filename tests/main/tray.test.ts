import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DownloadJob } from '@shared/types'

const { TrayMock, MenuMock, nativeImageMock, appMock, instances, template } = vi.hoisted(
  () => {
    const instances: Array<{
      tooltip: string
      setToolTip: ReturnType<typeof vi.fn>
      setContextMenu: ReturnType<typeof vi.fn>
      on: ReturnType<typeof vi.fn>
      destroy: ReturnType<typeof vi.fn>
      handlers: Map<string, () => void>
    }> = []
    const template: {
      current: Array<{ label?: string; click?: () => void; type?: string }>
    } = {
      current: []
    }
    class TrayMock {
      tooltip = ''
      handlers = new Map<string, () => void>()
      setToolTip = vi.fn((t: string) => {
        this.tooltip = t
      })
      setContextMenu = vi.fn()
      on = vi.fn((event: string, cb: () => void) => {
        this.handlers.set(event, cb)
      })
      destroy = vi.fn()
      constructor() {
        instances.push(this)
      }
    }
    return {
      TrayMock,
      MenuMock: {
        buildFromTemplate: vi.fn((t: Array<{ label?: string; click?: () => void }>) => {
          template.current = t
          return { menu: true }
        })
      },
      nativeImageMock: {
        createFromDataURL: vi.fn(() => ({
          isEmpty: () => false,
          resize: vi.fn(() => ({ resized: true, isEmpty: () => false }))
        }))
      },
      appMock: { quit: vi.fn() },
      instances,
      template
    }
  }
)

vi.mock('electron', () => ({
  app: appMock,
  Menu: MenuMock,
  Tray: TrayMock,
  nativeImage: nativeImageMock
}))

import { hasTray, initTray, updateTray, destroyTray } from '@main/tray'

const job = (overrides: Partial<DownloadJob>): DownloadJob =>
  ({ id: 'j', state: 'downloading', percent: 0, ...overrides }) as DownloadJob

beforeEach(() => {
  instances.length = 0
  vi.clearAllMocks()
  destroyTray()
})

describe('tray', () => {
  it('reports tray availability via hasTray', () => {
    expect(hasTray()).toBe(false)
    initTray(() => null)
    expect(hasTray()).toBe(true)
    destroyTray()
    expect(hasTray()).toBe(false)
  })

  it('skips the tray when the icon fails to load', () => {
    nativeImageMock.createFromDataURL.mockReturnValueOnce({
      isEmpty: () => true,
      resize: vi.fn(() => ({ resized: true, isEmpty: () => true }))
    } as never)
    initTray(() => null)
    expect(instances).toHaveLength(0)
    expect(hasTray()).toBe(false)
  })

  it('initTray creates a single tray with tooltip and menu', () => {
    initTray(() => null)
    expect(instances).toHaveLength(1)
    expect(instances[0].setToolTip).toHaveBeenCalledWith('YouTube Downloader')
    expect(instances[0].setContextMenu).toHaveBeenCalled()
  })

  it('initTray is idempotent', () => {
    initTray(() => null)
    initTray(() => null)
    expect(instances).toHaveLength(1)
  })

  it('tray click shows, restores, and focuses the window', () => {
    const win = {
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    }
    initTray(() => win as never)
    instances[0].handlers.get('click')!()
    expect(win.restore).toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })

  it('show is safe when no window exists', () => {
    initTray(() => null)
    expect(() => instances[0].handlers.get('click')!()).not.toThrow()
  })

  it('menu Quit calls app.quit', () => {
    initTray(() => null)
    const quit = template.current.find((m) => m.label === 'Quit')!
    quit.click!()
    expect(appMock.quit).toHaveBeenCalled()
  })

  it('updateTray is a no-op before init', () => {
    expect(() => updateTray([job({ state: 'downloading' })])).not.toThrow()
  })

  it('updateTray resets tooltip when nothing is active', () => {
    initTray(() => null)
    instances[0].setToolTip.mockClear()
    updateTray([job({ state: 'completed' })])
    expect(instances[0].setToolTip).toHaveBeenCalledWith('YouTube Downloader')
  })

  it('updateTray shows active count and average percent', () => {
    initTray(() => null)
    instances[0].setToolTip.mockClear()
    updateTray([
      job({ id: 'a', state: 'downloading', percent: 40 }),
      job({ id: 'b', state: 'downloading', percent: 60 }),
      job({ id: 'c', state: 'queued', percent: 0 })
    ])
    expect(instances[0].setToolTip).toHaveBeenCalledWith(
      'YouTube Downloader - 3 active (50%)'
    )
  })

  it('updateTray omits percent when nothing is actively downloading', () => {
    initTray(() => null)
    instances[0].setToolTip.mockClear()
    updateTray([job({ state: 'queued', percent: 0 })])
    expect(instances[0].setToolTip).toHaveBeenCalledWith('YouTube Downloader - 1 active')
  })

  it('destroyTray tears down the tray', () => {
    initTray(() => null)
    const created = instances[0]
    destroyTray()
    expect(created.destroy).toHaveBeenCalled()
  })
})
