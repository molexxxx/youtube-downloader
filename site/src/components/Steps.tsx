import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { shot, type ShotName } from '../shots'

interface Step {
  title: string
  body: string
  shot: ShotName
  alt: string
  /**
   * Top-left corner of the visible region, as fractions of the capture, and the
   * zoom. Each region ends at the Downloads panel's rule and starts and stops on
   * rows without text.
   */
  view: { x: number; y: number; zoom: number }
}

const STEPS: Step[] = [
  {
    title: 'Paste a link or search',
    body: 'Drop in a link to a video, playlist, channel, or Mix, or search YouTube from the same bar. A playlist opens as a list you can pick from.',
    shot: 'playlist',
    alt: 'A resolved playlist, Open Movie Night, listing selected videos with thumbnails and durations.',
    view: { x: 0, y: 0.00625, zoom: 2560 / 1760 }
  },
  {
    title: 'Pick a preset',
    body: 'Best MP4, 1080p MP4, 720p MP4, Best MKV, Audio MP3, or Audio FLAC. Or choose the exact resolution, frame rate, and codec, up to 4K.',
    shot: 'quality',
    alt: 'The six presets above an open format list showing 4K, 1440p, and 1080p choices with codec and size.',
    view: { x: 0, y: 0.225, zoom: 2560 / 1760 }
  },
  {
    title: 'Get the file',
    body: 'Up to 8 downloads run at once with live speed and ETA. Files land in Downloads with the thumbnail, metadata, and chapters embedded.',
    shot: 'history',
    alt: 'Download history with play, folder, and Discord buttons for each finished file.',
    view: { x: 0, y: 0.0075, zoom: 2560 / 1834 }
  }
]

/** Matches the stylesheet's query for the pinned layout. */
const PINNED = '(min-width: 1000px) and (min-height: 620px)'

const clamp = (value: number) => Math.min(1, Math.max(0, value))

function frameStyle({ x, y, zoom }: Step['view']): CSSProperties {
  const span = 1 - 1 / zoom
  return {
    transformOrigin: `${(x / span) * 100}% ${(y / span) * 100}%`,
    ['--zoom' as string]: zoom
  }
}

const SIZES = '(min-width: 1000px) 1300px, 150vw'

function Frames({ active, only }: { active: number; only?: boolean }) {
  return (
    <div className="steps-window">
      {STEPS.map((step, index) => {
        if (only && index !== active) return null
        const image = shot(step.shot)
        return (
          <img
            key={step.shot}
            className="frame"
            data-active={index === active || undefined}
            style={frameStyle(step.view)}
            src={image.src}
            srcSet={image.srcSet}
            sizes={SIZES}
            width={image.width}
            height={image.height}
            alt={index === active ? step.alt : ''}
            aria-hidden={index === active ? undefined : true}
            loading="lazy"
            decoding="async"
          />
        )
      })}
    </div>
  )
}

/**
 * Three steps under one app window. On wide screens the window stays pinned
 * while the page scrolls through a tall track, moving to each step's screen;
 * on narrow screens each step shows its own frame.
 */
export function Steps() {
  const [active, setActive] = useState(0)
  const track = useRef<HTMLDivElement>(null)
  const pin = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    const pinned = window.matchMedia(PINNED)
    let frame = 0
    const update = () => {
      frame = 0
      let current = 0
      if (pinned.matches && track.current && pin.current) {
        const top = parseFloat(getComputedStyle(pin.current).top) || 0
        const box = track.current.getBoundingClientRect()
        const distance = box.height - (window.innerHeight - top)
        const position =
          clamp(distance > 0 ? (top - box.top) / distance : 0) * STEPS.length
        current = Math.min(STEPS.length - 1, Math.floor(position))
        items.current.forEach((item, index) =>
          item?.style.setProperty('--progress', String(clamp(position - index)))
        )
      } else {
        const middle = window.innerHeight / 2
        items.current.forEach((item, index) => {
          if (!item) return
          const box = item.getBoundingClientRect()
          item.style.setProperty(
            '--progress',
            String(clamp((middle - box.top) / box.height))
          )
          if (box.top <= middle) current = index
        })
      }
      setActive(current)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    pinned.addEventListener('change', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      pinned.removeEventListener('change', schedule)
    }
  }, [])

  return (
    <div className="steps" ref={track}>
      <div className="steps-pin" ref={pin}>
        <div className="steps-stage">
          <Frames active={active} />
        </div>
        <ol className="steps-list">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              ref={(element) => {
                items.current[index] = element
              }}
              className="step"
              data-active={index === active || undefined}
            >
              <span className="step-number numeral" aria-hidden="true">
                {index + 1}
              </span>
              <div className="step-text">
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <span className="step-track" aria-hidden="true">
                  <span className="step-fill" />
                </span>
              </div>
              <div className="step-inline">
                <Frames active={index} only />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
