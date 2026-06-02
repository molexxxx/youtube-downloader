import type { Theme } from '@shared/types'

/**
 * Resolve and apply a theme preference onto the document. 'system' follows the OS
 * preference (kept live by the caller via a matchMedia listener). Returns a cleanup
 * function that detaches the system listener when one was attached.
 */
export function applyTheme(theme: Theme): () => void {
  const media = window.matchMedia('(prefers-color-scheme: light)')

  const resolve = (): void => {
    const isLight = theme === 'light' || (theme === 'system' && media.matches)
    document.documentElement.classList.toggle('light', isLight)
    document.documentElement.classList.toggle('dark', !isLight)
  }

  resolve()

  if (theme === 'system') {
    media.addEventListener('change', resolve)
    return () => media.removeEventListener('change', resolve)
  }
  return () => {}
}
