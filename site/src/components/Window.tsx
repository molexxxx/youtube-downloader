import { shot, type ShotName } from '../shots'

interface WindowProps {
  name: ShotName
  alt: string
  sizes: string
  caption?: string
  eager?: boolean
  className?: string
}

/** A capture of the app, framed the way the app window sits on a desktop. */
export function Window({ name, alt, sizes, caption, eager, className }: WindowProps) {
  const image = shot(name)
  return (
    <figure className={`window${className ? ` ${className}` : ''}`}>
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
