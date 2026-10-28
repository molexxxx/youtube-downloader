import { useEffect, useRef } from 'react'
import { REPO_URL } from '../release'
import { SECTIONS } from '../sections'
import { BrandMark, GitHubMark } from './Marks'

/** The stage's title bar: page tabs underlined like the app's own tabs. */
export function Bar({ active }: { active: string }) {
  const tabs = useRef<HTMLElement>(null)

  useEffect(() => {
    const row = tabs.current
    const tab = row?.querySelector<HTMLElement>('[aria-current]')
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return
    const inset = parseFloat(getComputedStyle(row).paddingLeft) || 0
    const left = tab.offsetLeft - row.offsetLeft
    if (
      left < row.scrollLeft + inset ||
      left + tab.offsetWidth > row.scrollLeft + row.clientWidth - inset
    ) {
      row.scrollTo({ left: left - inset, behavior: 'smooth' })
    }
  }, [active])

  return (
    <header className="bar">
      <a className="bar-brand" href="#top">
        <BrandMark size={28} />
        <span>YouTube Downloader</span>
      </a>
      <nav className="bar-tabs" aria-label="Page" ref={tabs}>
        {SECTIONS.map(({ id, label, icon: Icon, tone }) => (
          <a
            key={id}
            href={`#${id}`}
            className="tab"
            data-tone={tone}
            aria-current={active === id ? 'location' : undefined}
          >
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
            {label}
          </a>
        ))}
      </nav>
      <a className="bar-github" href={REPO_URL}>
        <GitHubMark size={18} />
        <span>GitHub</span>
      </a>
    </header>
  )
}
