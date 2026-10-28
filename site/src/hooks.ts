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
 * Tracks which section crosses the middle band of the viewport, and takes over
 * in-page links: the target is marked at once, sections passed on the way are
 * ignored, and jumps longer than two screens skip the animation.
 */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0])
  const jumping = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (jumping.current) return
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-45% 0px -50% 0px' }
    )
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
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

    document.addEventListener('click', onClick)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick)
      settle()
    }
  }, [ids])

  return active
}
