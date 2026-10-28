import { useRef, useState, type KeyboardEvent } from 'react'
import { useMediaQuery } from '../hooks'
import { CAPTIONS, shot, type ShotName } from '../shots'
import { Enlarge } from './Lightbox'

interface Step {
  title: string
  body: string
  shot: ShotName
}

const STEPS: Step[] = [
  {
    title: 'Paste a link or search',
    body: 'Drop in a link to a video, playlist, channel, or Mix, or search YouTube from the same bar. A playlist opens as a list you can pick from.',
    shot: 'playlist'
  },
  {
    title: 'Pick a preset',
    body: 'Best MP4, 1080p MP4, 720p MP4, Best MKV, Audio MP3, or Audio FLAC. Or choose the exact resolution, frame rate, and codec, up to 4K.',
    shot: 'quality'
  },
  {
    title: 'Get the file',
    body: 'Up to 8 downloads run at once with live speed and ETA. Files land in Downloads with the thumbnail, metadata, and chapters embedded.',
    shot: 'history'
  }
]

const SIZES = '(min-width: 1180px) calc(100vw - 520px), calc(100vw - 40px)'

/** The step captures stacked in one window, with only the active one shown. */
function Frames({ active, only }: { active: number; only?: boolean }) {
  return (
    <Enlarge name={STEPS[active].shot}>
      <span className="steps-window">
        {STEPS.map((step, index) => {
          if (only && index !== active) return null
          const image = shot(step.shot)
          return (
            <img
              key={step.shot}
              className="frame"
              data-active={index === active || undefined}
              src={image.src}
              srcSet={image.srcSet}
              sizes={SIZES}
              width={image.width}
              height={image.height}
              alt={index === active ? CAPTIONS[step.shot] : ''}
              aria-hidden={index === active ? undefined : true}
              loading="lazy"
              decoding="async"
            />
          )
        })}
      </span>
    </Enlarge>
  )
}

/** One app window above the three steps; choosing a step shows its screen. */
function StepTabs() {
  const [active, setActive] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (index: number) => {
    const next = (index + STEPS.length) % STEPS.length
    setActive(next)
    tabs.current[next]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: STEPS.length - 1
    }
    if (event.key in moves) {
      event.preventDefault()
      select(moves[event.key])
    }
  }

  return (
    <div>
      <div id="steps-panel" role="tabpanel" aria-labelledby={`step-tab-${active}`}>
        <Frames active={active} />
      </div>
      <div className="step-tabs" role="tablist" aria-label="How it works">
        {STEPS.map((step, index) => (
          <button
            key={step.title}
            ref={(element) => {
              tabs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`step-tab-${index}`}
            aria-selected={index === active}
            aria-controls="steps-panel"
            aria-labelledby={`step-title-${index}`}
            aria-describedby={`step-body-${index}`}
            tabIndex={index === active ? 0 : -1}
            className="step-tab"
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="step-number numeral" aria-hidden="true">
              {index + 1}
            </span>
            <span className="step-text">
              <span className="step-title" id={`step-title-${index}`}>
                {step.title}
              </span>
              <span className="step-body" id={`step-body-${index}`}>
                {step.body}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** The three steps as a list, each with its own capture, for narrow screens. */
function StepList() {
  return (
    <ol className="steps-list">
      {STEPS.map((step, index) => (
        <li key={step.title} className="step">
          <span className="step-number numeral" aria-hidden="true">
            {index + 1}
          </span>
          <div className="step-text">
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </div>
          <div className="step-inline">
            <Frames active={index} only />
          </div>
        </li>
      ))}
    </ol>
  )
}

export function Steps() {
  return useMediaQuery('(min-width: 1000px)') ? <StepTabs /> : <StepList />
}
