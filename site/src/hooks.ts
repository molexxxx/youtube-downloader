import { useEffect, useState } from 'react'
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

/** Tracks which section crosses the middle band of the viewport. */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
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
    return () => observer.disconnect()
  }, [ids])
  return active
}
