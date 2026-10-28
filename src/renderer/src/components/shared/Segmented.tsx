/** One choice in a {@link Segmented} control. */
export interface SegmentOption<T extends string> {
  value: T
  label: string
  sublabel?: string
  icon?: React.ReactNode
  disabled?: boolean
}

/**
 * Ruled segmented control for picking one of a few options. The selected
 * segment speaks in the section accent (red in the downloader, blue in
 * Discord). `size="sm"` is the compact variant for short codes such as
 * containers and audio formats.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  uppercase = false,
  capitalize = false,
  disabled = false
}: {
  label: string
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  size?: 'md' | 'sm'
  uppercase?: boolean
  capitalize?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded-sm border border-[var(--t-rule-strong)]"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            disabled={disabled || o.disabled}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 border-l border-[var(--t-rule-strong)] font-semibold transition-[background-color,color] duration-150 first:border-l-0 disabled:cursor-not-allowed ${
              size === 'md' ? 'px-3 py-2.5 text-sm' : 'px-2 py-2 text-xs'
            } ${uppercase ? 'uppercase' : capitalize ? 'capitalize' : ''} ${
              active
                ? 'bg-[var(--t-accent-soft)] text-[var(--t-accent-text)] shadow-[inset_0_0_0_1px_var(--t-accent)]'
                : 'text-[var(--t-dim)] enabled:hover:bg-[var(--t-hover)] enabled:hover:text-[var(--t-fg)] disabled:text-[var(--t-faint)]'
            }`}
          >
            {o.icon}
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate">{o.label}</span>
              {o.sublabel && (
                <span
                  className={`truncate text-[11px] font-normal normal-case ${
                    active ? 'opacity-70' : 'text-[var(--t-faint)]'
                  }`}
                >
                  {o.sublabel}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
