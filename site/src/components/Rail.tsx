import { REPO_URL } from '../release'
import { SECTIONS } from '../sections'
import { BrandMark, GitHubMark } from './Marks'

/** The page navigation, drawn like the app's server rail; on phones it docks to the bottom of the screen. */
export function Rail({ active }: { active: string }) {
  return (
    <nav className="rail" aria-label="Page">
      <a className="rail-brand" href="#top" aria-label="YouTube Downloader, back to top">
        <BrandMark size={44} />
      </a>
      <div className="rail-tiles">
        {SECTIONS.map(({ id, label, icon: Icon, tone }) => (
          <a
            key={id}
            href={`#${id}`}
            className="tile"
            data-tone={tone}
            data-active={active === id || undefined}
            aria-current={active === id ? 'location' : undefined}
          >
            <span className="tile-bar" aria-hidden="true" />
            <span className="tile-box" aria-hidden="true">
              <Icon size={20} strokeWidth={2} />
            </span>
            <span className="tile-label">{label}</span>
          </a>
        ))}
      </div>
      <a
        className="rail-foot"
        href={REPO_URL}
        aria-label="Source on GitHub"
        title="Source on GitHub"
      >
        <GitHubMark size={20} />
      </a>
    </nav>
  )
}
