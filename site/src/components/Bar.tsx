import { REPO_URL } from '../release'
import { BrandMark, GitHubMark } from './Marks'

/** The phone header: the brand and GitHub. Section navigation is the rail, which docks to the bottom on phones. */
export function Bar() {
  return (
    <header className="bar">
      <a className="bar-brand" href="#top">
        <BrandMark size={28} />
        <span>YouTube Downloader</span>
      </a>
      <a className="bar-github" href={REPO_URL}>
        <GitHubMark size={18} />
        <span>GitHub</span>
      </a>
    </header>
  )
}
