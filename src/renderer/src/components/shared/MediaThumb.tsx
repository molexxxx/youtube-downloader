import { useState } from 'react'
import { AlertCircle, Check, Music, Video, X } from 'lucide-react'
import type { DownloadKind } from '@shared/types'
import { youtubeThumbnailUrl } from '../../lib/format'

const SIZES = {
  sm: 'h-[27px] w-12',
  md: 'h-9 w-16',
  lg: 'h-[54px] w-24'
} as const

type ThumbStatus = 'completed' | 'error' | 'cancelled'

/**
 * 16:9 thumbnail for a queue job or history entry. The image is derived from
 * the YouTube URL; anything else falls back to the download kind's icon. An
 * optional status badge sits in the corner so rows can drop a separate icon.
 */
export function MediaThumb({
  url,
  kind,
  size = 'sm',
  status,
  dim = false
}: {
  url: string
  kind: DownloadKind
  size?: keyof typeof SIZES
  status?: ThumbStatus
  dim?: boolean
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const src = failed ? null : youtubeThumbnailUrl(url)

  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-sm bg-[var(--t-rule)] ${SIZES[size]} ${
        dim ? 'opacity-55' : ''
      }`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[var(--t-faint)]">
          {kind === 'audio' ? <Music size={14} /> : <Video size={14} />}
        </span>
      )}
      {status && <StatusBadge status={status} />}
    </span>
  )
}

function StatusBadge({ status }: { status: ThumbStatus }): React.JSX.Element {
  const label =
    status === 'completed' ? 'Completed' : status === 'error' ? 'Failed' : 'Cancelled'
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-[var(--t-ring)] ${
        status === 'completed'
          ? 'bg-[var(--w-live)] text-[#0b0b0b]'
          : status === 'error'
            ? 'bg-[var(--w-red)] text-[#fff]'
            : 'bg-[var(--t-dim)] text-[var(--t-ring)]'
      }`}
    >
      {status === 'completed' ? (
        <Check size={10} strokeWidth={3} />
      ) : status === 'error' ? (
        <AlertCircle size={10} strokeWidth={2.5} />
      ) : (
        <X size={10} strokeWidth={3} />
      )}
    </span>
  )
}
