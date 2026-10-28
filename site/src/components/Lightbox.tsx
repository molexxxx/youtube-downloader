import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from 'react'
import { CAPTIONS, GALLERY, shot, type ShotName } from '../shots'

const OpenShot = createContext<(name: ShotName) => void>(() => undefined)

/** Opens the full-quality viewer on a capture. */
export function useLightbox() {
  return useContext(OpenShot)
}

/**
 * A full-screen viewer for the captures: fit to the screen or shown at actual
 * pixels, with previous and next. Esc, the close button, or a click outside the
 * image dismisses it. At actual size the image area takes focus so the arrow
 * keys pan it.
 */
export function LightboxProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const anchor = useRef({ x: 0.5, y: 0.5 })
  const [index, setIndex] = useState<number | null>(null)
  const [actual, setActual] = useState(false)

  const open = useCallback((name: ShotName) => {
    setActual(false)
    setIndex(GALLERY.indexOf(name))
  }, [])

  const close = () => setIndex(null)

  const move = (delta: number) => {
    setActual(false)
    setIndex((current) =>
      current === null ? current : (current + delta + GALLERY.length) % GALLERY.length
    )
  }

  const toggleActual = (point = { x: 0.5, y: 0.5 }) => {
    anchor.current = point
    setActual((value) => !value)
  }

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (index !== null && !element.open) element.showModal()
    if (index === null && element.open) element.close()
  }, [index])

  useLayoutEffect(() => {
    const area = stage.current
    if (!actual || !area) return
    const { x, y } = anchor.current
    area.scrollLeft = x * area.scrollWidth - area.clientWidth / 2
    area.scrollTop = y * area.scrollHeight - area.clientHeight / 2
    area.focus({ preventScroll: true })
  }, [actual, index])

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (actual) return
    if (event.key === 'ArrowRight') move(1)
    else if (event.key === 'ArrowLeft') move(-1)
  }

  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    const target = event.target as HTMLElement
    if (target === event.currentTarget || target === stage.current) close()
  }

  const onImageClick = (event: MouseEvent<HTMLImageElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    toggleActual(
      actual
        ? undefined
        : {
            x: (event.clientX - box.left) / box.width,
            y: (event.clientY - box.top) / box.height
          }
    )
  }

  const name = index === null ? null : GALLERY[index]
  const image = name ? shot(name) : null
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1

  return (
    <OpenShot.Provider value={open}>
      {children}
      <dialog
        ref={dialog}
        className="lightbox"
        aria-label="Screenshot viewer"
        onClose={close}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {name && image && index !== null && (
          <>
            <div className="lightbox-bar">
              <p className="lightbox-caption">{CAPTIONS[name]}</p>
              <div className="lightbox-controls">
                <button
                  type="button"
                  className="lightbox-button lightbox-icon"
                  aria-label="Previous screenshot"
                  onClick={() => move(-1)}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <span className="lightbox-count numeral">
                  {index + 1} of {GALLERY.length}
                </span>
                <button
                  type="button"
                  className="lightbox-button lightbox-icon"
                  aria-label="Next screenshot"
                  onClick={() => move(1)}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="lightbox-button"
                  aria-pressed={actual}
                  onClick={() => toggleActual()}
                >
                  {actual ? (
                    <Minimize2 size={16} aria-hidden="true" />
                  ) : (
                    <Maximize2 size={16} aria-hidden="true" />
                  )}
                  {actual ? 'Fit to screen' : 'Actual size'}
                </button>
                <button
                  type="button"
                  className="lightbox-button lightbox-icon"
                  aria-label="Close"
                  onClick={close}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div
              ref={stage}
              className="lightbox-stage"
              data-actual={actual || undefined}
              tabIndex={actual ? 0 : -1}
              role={actual ? 'group' : undefined}
              aria-label={
                actual
                  ? 'Screenshot at actual size; use the arrow keys to pan'
                  : undefined
              }
            >
              <img
                src={image.full}
                width={image.width}
                height={image.height}
                alt={CAPTIONS[name]}
                style={
                  actual
                    ? { width: image.fullWidth / ratio }
                    : { maxWidth: `min(100%, ${image.fullWidth / ratio}px)` }
                }
                onClick={onImageClick}
              />
            </div>
          </>
        )}
      </dialog>
    </OpenShot.Provider>
  )
}

/** Wraps a capture so a click opens it in the viewer. */
export function Enlarge({ name, children }: { name: ShotName; children: ReactNode }) {
  const open = useLightbox()
  return (
    <button type="button" className="enlarge" onClick={() => open(name)}>
      <span className="sr-only">Enlarge screenshot: </span>
      {children}
      <span className="enlarge-chip" aria-hidden="true">
        <Maximize2 size={14} />
        Enlarge
      </span>
    </button>
  )
}
