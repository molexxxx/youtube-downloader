import { REPO_URL } from '../release'
import { SECTIONS } from '../sections'
import { BrandMark, GitHubMark } from './Marks'

/**
 * The floor rail, drawn like the app's server rail. It mirrors the bar's page
 * navigation for pointer users, so it stays out of the tab order and the
 * accessibility tree.
 */
export function Rail({ active }: { active: string }) {
  return (
    <div className="rail">
      <a className="rail-brand" href="#top" aria-label="YouTube Downloader, back to top">
        <BrandMark size={44} />
      </a>
      <div className="rail-tiles" aria-hidden="true">
        {SECTIONS.map(({ id, label, icon: Icon, tone }) => (
          <a
            key={id}
            href={`#${id}`}
            tabIndex={-1}
            className="tile"
            data-tone={tone}
            data-active={active === id || undefined}
            title={label}
          >
            <span className="tile-bar" />
            <span className="tile-box">
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
    </div>
  )
}
