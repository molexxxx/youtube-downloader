import { Fragment } from 'react'
import { Link2, Search, ListVideo, Music } from 'lucide-react'

const ACCEPTS = [
  { icon: Link2, label: 'Paste a video link' },
  { icon: ListVideo, label: 'Drop a playlist URL' },
  { icon: Search, label: 'Search by keywords' },
  { icon: Music, label: 'Grab audio only' }
] as const

/** First-run teaching state: one plain line of what the bar above accepts. */
export function EmptyState(): React.JSX.Element {
  return (
    <section className="flex flex-1 flex-col justify-center pb-10 pt-4">
      <h3 className="display text-[30px]">Ready when you are</h3>
      <p className="mt-4 max-w-md text-[15px] text-[var(--t-dim)]">
        Paste a YouTube link or search above to load a video or playlist.
      </p>
      <p className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {ACCEPTS.map(({ icon: Icon, label }, i) => (
          <Fragment key={label}>
            {i > 0 && (
              <span aria-hidden="true" className="text-[var(--t-faint)]">
                ·
              </span>
            )}
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon size={14} className="shrink-0 text-[var(--t-red)]" />
              {label}
            </span>
          </Fragment>
        ))}
      </p>
    </section>
  )
}

/** Loading placeholder shaped like the resolved media layout. */
export function ResolveSkeleton(): React.JSX.Element {
  return (
    <div
      aria-busy="true"
      aria-label="Loading video details"
      className="grid grid-cols-[minmax(0,1.05fr)_minmax(320px,1fr)] items-start gap-10"
    >
      <div className="aspect-video w-full animate-pulse rounded-sm bg-[var(--t-rule)]" />
      <div className="flex flex-col gap-3">
        <div className="h-10 w-11/12 animate-pulse rounded-sm bg-[var(--t-rule)]" />
        <div className="h-10 w-2/3 animate-pulse rounded-sm bg-[var(--t-rule)]" />
        <div className="mt-1 h-4 w-1/3 animate-pulse rounded-sm bg-[var(--t-rule)]" />
        <div className="mt-6 h-[76px] animate-pulse rounded-sm bg-[var(--t-rule)]" />
        <div className="h-11 animate-pulse rounded-sm bg-[var(--t-rule)]" />
        <div className="h-11 animate-pulse rounded-sm bg-[var(--t-rule)]" />
        <div className="mt-4 h-12 animate-pulse rounded-sm bg-[var(--t-rule)]" />
      </div>
    </div>
  )
}
