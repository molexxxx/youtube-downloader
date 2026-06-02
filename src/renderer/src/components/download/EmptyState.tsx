import { Link2, Search, ListVideo, Music } from 'lucide-react'

const HINTS = [
  { icon: Link2, label: 'Paste a video link', hint: 'youtube.com/watch?v=…' },
  { icon: ListVideo, label: 'Drop a playlist URL', hint: 'pick exactly what you want' },
  { icon: Search, label: 'Search by keywords', hint: 'find without leaving the app' },
  { icon: Music, label: 'Grab audio only', hint: 'MP3, M4A, Opus and more' }
] as const

function AmbientBackground(): React.JSX.Element {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 600 400"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="blob-red" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(239,68,68)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(239,68,68)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blob-rose" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(244,114,182)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="rgb(244,114,182)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blob-amber" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(251,146,60)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="rgb(251,146,60)" stopOpacity="0" />
        </radialGradient>
        <pattern id="dot-grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="rgba(255,255,255,0.04)" />
        </pattern>
      </defs>
      <rect width="600" height="400" fill="url(#dot-grid)" />
      <circle className="anim-blob-a" cx="150" cy="120" r="150" fill="url(#blob-red)" />
      <circle className="anim-blob-b" cx="470" cy="300" r="170" fill="url(#blob-rose)" />
      <circle className="anim-blob-c" cx="420" cy="90" r="120" fill="url(#blob-amber)" />
    </svg>
  )
}

function AnimatedIcon(): React.JSX.Element {
  return (
    <div className="anim-float relative mx-auto h-20 w-20">
      <svg viewBox="0 0 80 80" className="h-full w-full">
        {/* breathing halo */}
        <circle className="anim-ring" cx="40" cy="40" r="30" fill="rgba(239,68,68,0.12)" />
        {/* rotating dashed orbit */}
        <circle
          className="anim-orbit"
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="rgba(239,68,68,0.35)"
          strokeWidth="1.5"
          strokeDasharray="3 7"
          strokeLinecap="round"
        />
        {/* counter-rotating inner orbit with travelling node */}
        <g className="anim-orbit-rev" style={{ transformOrigin: 'center' }}>
          <circle
            cx="40"
            cy="40"
            r="26"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
          <circle cx="40" cy="14" r="2.5" fill="rgb(248,113,113)" />
        </g>
        {/* core badge */}
        <circle cx="40" cy="40" r="20" fill="rgba(239,68,68,0.16)" />
        <circle
          cx="40"
          cy="40"
          r="20"
          fill="none"
          stroke="rgba(239,68,68,0.4)"
          strokeWidth="1"
        />
        {/* traced link glyph */}
        <g
          className="anim-trace"
          fill="none"
          stroke="rgb(248,113,113)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(28 28) scale(1)"
        >
          <path d="M10 14a4 4 0 0 0 6 0l4-4a4 4 0 1 0-6-6l-1 1" />
          <path d="M14 10a4 4 0 0 0-6 0l-4 4a4 4 0 1 0 6 6l1-1" />
        </g>
      </svg>
    </div>
  )
}

export function EmptyState(): React.JSX.Element {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8">
      <AmbientBackground />
      <div className="relative w-full max-w-md text-center">
        <AnimatedIcon />
        <h3 className="mt-4 text-lg font-semibold text-white/90">Ready when you are</h3>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-white/45">
          Paste a YouTube link or search above to load a video or playlist.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2.5 text-left">
          {HINTS.map(({ icon: Icon, label, hint }) => (
            <div
              key={label}
              className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 backdrop-blur-sm transition-colors hover:border-white/10 hover:bg-white/[0.04]"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
                <Icon size={15} className="text-white/55" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white/75">{label}</p>
                <p className="truncate text-[11px] text-white/35">{hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ResolveSkeleton(): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
      <div className="flex gap-4">
        <div className="h-24 w-40 shrink-0 animate-pulse rounded-lg bg-white/5" />
        <div className="min-w-0 flex-1 space-y-2.5 py-1">
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-white/5" />
        </div>
      </div>
      <div className="mt-4 flex gap-1.5">
        {[16, 20, 14, 18].map((w, i) => (
          <div
            key={i}
            className="h-6 animate-pulse rounded-full bg-white/5"
            style={{ width: `${w * 4}px` }}
          />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-12 flex-1 animate-pulse rounded-xl bg-white/5" />
        <div className="h-12 flex-1 animate-pulse rounded-xl bg-white/5" />
      </div>
      <div className="mt-3 h-10 animate-pulse rounded-lg bg-white/5" />
      <div className="mt-3 h-10 animate-pulse rounded-xl bg-white/5" />
    </div>
  )
}
