/**
 * The app mark, drawn from the same 1024-unit geometry as the app icon: a play
 * triangle turned down onto a baseline (download) on the red tile.
 */
export function BrandMark({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="1024" height="1024" rx="232" className="fill-[var(--w-red)]" />
      <path
        d="M349 305 h326 a28 28 0 0 1 24 43 l-163 247 a28 28 0 0 1 -48 0 l-163 -247 a28 28 0 0 1 24 -43 z"
        fill="#fff"
      />
      <rect x="349" y="676" width="326" height="58" rx="29" fill="#fff" />
    </svg>
  )
}
