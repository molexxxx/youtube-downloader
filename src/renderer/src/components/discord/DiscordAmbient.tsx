/**
 * Ambient background for the Discord section: the downloader's dot grid and
 * drifting blob treatment re-tinted to the section's blurple identity. Reuses
 * the anim-blob keyframes from globals.css.
 */
export function DiscordAmbient(): React.JSX.Element {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 600 400"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="blob-indigo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blob-violet" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(167,139,250)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="rgb(167,139,250)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blob-sky" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(56,189,248)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="rgb(56,189,248)" stopOpacity="0" />
        </radialGradient>
        <pattern
          id="dot-grid-discord"
          width="26"
          height="26"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1.5" cy="1.5" r="1.5" fill="rgba(255,255,255,0.04)" />
        </pattern>
      </defs>
      <rect width="600" height="400" fill="url(#dot-grid-discord)" />
      <circle
        className="anim-blob-a"
        cx="150"
        cy="120"
        r="150"
        fill="url(#blob-indigo)"
      />
      <circle
        className="anim-blob-b"
        cx="470"
        cy="300"
        r="170"
        fill="url(#blob-violet)"
      />
      <circle className="anim-blob-c" cx="420" cy="90" r="120" fill="url(#blob-sky)" />
    </svg>
  )
}
