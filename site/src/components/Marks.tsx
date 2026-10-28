import { useId } from 'react'

/** The app icon: the download mark on the red tile with the blue bot badge. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const mask = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <mask id={mask}>
          <rect width="1024" height="1024" fill="#fff" />
          <circle cx="844" cy="844" r="186" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <rect width="1024" height="1024" rx="232" fill="var(--w-red)" />
        <path
          d="M349 305 h326 a28 28 0 0 1 24 43 l-163 247 a28 28 0 0 1 -48 0 l-163 -247 a28 28 0 0 1 24 -43 z"
          fill="#fff"
        />
        <rect x="349" y="676" width="326" height="58" rx="29" fill="#fff" />
      </g>
      <circle cx="844" cy="844" r="160" fill="var(--w-blue)" />
      <rect x="835.74" y="773.81" width="16.52" height="26.84" fill="#fff" />
      <circle cx="844" cy="765.55" r="13.42" fill="#fff" />
      <rect x="773.81" y="798.58" width="140.39" height="107.35" rx="30.97" fill="#fff" />
      <circle cx="813.03" cy="852.26" r="15.48" fill="var(--w-blue)" />
      <circle cx="874.97" cy="852.26" r="15.48" fill="var(--w-blue)" />
    </svg>
  )
}

/** GitHub's mark, from Primer Octicons (MIT). */
export function GitHubMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
