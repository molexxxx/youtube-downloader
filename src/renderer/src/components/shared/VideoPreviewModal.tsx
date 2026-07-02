import { useEffect } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'

/**
 * In-app YouTube preview. Opens over everything as a dismissable modal (Esc,
 * the X, or clicking the backdrop closes it) with the video playing in a
 * privacy-enhanced embed, so you can check content before downloading it.
 */
export function VideoPreviewModal(): React.JSX.Element | null {
  const preview = useAppStore((s) => s.preview)
  const setPreview = useAppStore((s) => s.setPreview)

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, setPreview])

  if (!preview) return null

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${preview.title}`}
    >
      <div className="anim-toast-in flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e1016] shadow-2xl shadow-black/60">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-4 py-2.5">
          <span className="text-red-500">▶</span>
          <p className="selectable min-w-0 flex-1 truncate text-sm font-medium text-white/90">
            {preview.title}
          </p>
          <button
            onClick={() => void window.api.system.openExternal(preview.watchUrl)}
            title="Watch on YouTube"
            aria-label="Watch on YouTube"
            className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <ExternalLink size={15} />
          </button>
          <button
            onClick={() => setPreview(null)}
            title="Close preview"
            aria-label="Close preview"
            className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <X size={16} />
          </button>
        </div>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={preview.embedUrl}
            title={preview.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  )
}
