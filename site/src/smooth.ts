import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

let lenis: Lenis | null = null

/** Elements that keep native scrolling: the viewer, and the rail or panel when they overflow. */
function keepsNativeScroll(node: HTMLElement): boolean {
  if (node.classList.contains('lightbox')) return true
  const own = node.classList.contains('panel') || node.classList.contains('rail')
  return own && node.scrollHeight > node.clientHeight + 1
}

/** Starts inertial wheel scrolling for the page, unless the visitor prefers reduced motion. */
export function startSmoothScroll(): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return () => undefined
  const instance = new Lenis({ autoRaf: true, lerp: 0.15, prevent: keepsNativeScroll })
  lenis = instance
  return () => {
    instance.destroy()
    if (lenis === instance) lenis = null
  }
}

/** Scrolls the page to a position, through the smooth scroller when it runs, and reports when it lands. */
export function scrollPage(top: number, immediate: boolean, onComplete: () => void) {
  if (lenis) {
    lenis.scrollTo(top, { immediate, force: true, onComplete })
    return
  }
  window.addEventListener('scrollend', onComplete, { once: true })
  window.scrollTo({ top, behavior: immediate ? 'instant' : 'smooth' })
}

/**
 * On desktop, fetches the remaining lazy captures once the page is idle, so
 * none of them first decodes in the middle of a scroll. Phones keep lazy
 * loading to save data.
 */
export function warmCaptures(): () => void {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches)
    return () => undefined
  const warm = () => {
    for (const image of document.querySelectorAll<HTMLImageElement>(
      'img[loading="lazy"]'
    )) {
      image.loading = 'eager'
    }
  }
  const idle =
    window.requestIdleCallback ??
    ((callback: () => void) => window.setTimeout(callback, 1500))
  const cancel = window.cancelIdleCallback ?? window.clearTimeout
  let handle = 0
  const schedule = () => {
    handle = idle(warm)
  }
  if (document.readyState === 'complete') schedule()
  else window.addEventListener('load', schedule, { once: true })
  return () => {
    window.removeEventListener('load', schedule)
    cancel(handle)
  }
}

/** Holds the page still while an overlay is open. */
export function holdScroll(held: boolean) {
  if (held) lenis?.stop()
  else lenis?.start()
}
