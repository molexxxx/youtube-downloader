import { CAPTIONS, shot, type ShotName } from '../shots'
import { Enlarge } from './Lightbox'

interface WindowProps {
  name: ShotName
  sizes: string
  caption?: string
  eager?: boolean
  className?: string
}

/** A capture of the app, framed the way the app window sits on a desktop; a click enlarges it. */
export function Window({ name, sizes, caption, eager, className }: WindowProps) {
  const image = shot(name)
  return (
    <figure className={`window${className ? ` ${className}` : ''}`}>
      <Enlarge name={name}>
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes={sizes}
          width={image.width}
          height={image.height}
          alt={CAPTIONS[name]}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
        />
      </Enlarge>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
