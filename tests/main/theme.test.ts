import { describe, expect, it, vi, beforeEach } from 'vitest'

const { nativeTheme, getConfigMock } = vi.hoisted(() => ({
  nativeTheme: { themeSource: 'system' as string },
  getConfigMock: vi.fn(() => ({ theme: 'dark' }))
}))

vi.mock('electron', () => ({ nativeTheme }))
vi.mock('@main/config', () => ({ getConfig: getConfigMock }))

import { applyTheme } from '@main/theme'

beforeEach(() => {
  nativeTheme.themeSource = 'system'
  getConfigMock.mockReturnValue({ theme: 'dark' })
})

describe('applyTheme', () => {
  it('maps explicit themes straight through', () => {
    applyTheme('light')
    expect(nativeTheme.themeSource).toBe('light')
    applyTheme('dark')
    expect(nativeTheme.themeSource).toBe('dark')
  })

  it('passes system through unchanged', () => {
    applyTheme('system')
    expect(nativeTheme.themeSource).toBe('system')
  })

  it('falls back to the stored config theme', () => {
    getConfigMock.mockReturnValue({ theme: 'light' })
    applyTheme()
    expect(nativeTheme.themeSource).toBe('light')
  })
})
