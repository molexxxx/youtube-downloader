import { useEffect, useRef, useState } from 'react'
import { fetchReleases, summarize, type ReleaseSummary } from './release'

/** Starts from the build-time snapshot and swaps in live GitHub data when it arrives. */
export function useRelease(): ReleaseSummary | null {
  const [release, setRelease] = useState<ReleaseSummary | null>(__RELEASE_SNAPSHOT__)
  useEffect(() => {
    const controller = new AbortController()
    fetchReleases(undefined, controller.signal)
      .then((releases) => {
        const summary = summarize(releases)
        if (summary) setRelease(summary)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])
  return release
}

/** Follows a media query, for layouts that change structure rather than style. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}

/**
 * Tracks the last section whose top has passed 45% of the viewport (the last
 * section once the page is scrolled to the end), and takes over in-page links:
 * the target is marked at once, sections passed on the way are ignored, and
 * jumps longer than two screens skip the animation.
 */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0])
  const jumping = useRef(false)

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      if (jumping.current) return
      const line = window.innerHeight * 0.45
      const end =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      let current = ids[0]
      for (const id of ids) {
        const element = document.getElementById(id)
        if (element && element.getBoundingClientRect().top <= line) current = id
      }
      setActive(end ? ids[ids.length - 1] : current)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    let timer = 0
    const settle = () => {
      jumping.current = false
      window.clearTimeout(timer)
      window.removeEventListener('scrollend', settle)
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
      const id = link?.getAttribute('href')?.slice(1)
      if (!id) return
      const target = id === 'top' ? null : document.getElementById(id)
      if (id !== 'top' && !target) return
      event.preventDefault()

      const padding =
        parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
      const top = target
        ? window.scrollY + target.getBoundingClientRect().top - padding
        : 0
      const far = Math.abs(top - window.scrollY) > window.innerHeight * 2
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      settle()
      jumping.current = true
      setActive((current) => (id === 'top' ? ids[0] : ids.includes(id) ? id : current))
      window.addEventListener('scrollend', settle)
      timer = window.setTimeout(settle, 1500)
      window.scrollTo({ top, behavior: far || still ? 'instant' : 'smooth' })
      history.pushState(null, '', `#${id}`)

      if (target) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
        target.focus({ preventScroll: true })
      }
    }

    measure()
    document.addEventListener('click', onClick)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('click', onClick)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      settle()
    }
  }, [ids])

  return active
}
