import { nativeTheme } from 'electron'
import type { Theme } from '@shared/types'
import { getConfig } from './config'

/**
 * Drive Electron's native theme (window chrome, color-scheme media query) from the
 * stored preference. Renderer mirrors the resolved value onto the document.
 */
export function applyTheme(theme: Theme = getConfig().theme): void {
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme
}
