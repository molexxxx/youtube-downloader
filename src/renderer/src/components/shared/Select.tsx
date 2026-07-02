import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  hint?: string
}

/** Largest height the menu is ever allowed to take (matches `max-h-64`). */
const MAX_MENU_HEIGHT = 256
/** Breathing room kept between the menu and the viewport edge. */
const VIEWPORT_MARGIN = 8

/**
 * Custom dropdown that replaces the native <select>. Styled to match the app,
 * closes on outside click or Escape, and supports basic keyboard navigation.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
  accent = 'red'
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  accent?: 'red' | 'indigo'
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [placement, setPlacement] = useState<{ dir: 'down' | 'up'; maxHeight: number }>({
    dir: 'down',
    maxHeight: MAX_MENU_HEIGHT
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  /*
   * Decide whether the menu opens downward or upward based on the space left
   * around the trigger. Opens up only when the space below is too tight AND
   * there is more room above; the menu height is then clamped to whatever the
   * chosen side can fit so it never spills past the window edge.
   */
  useLayoutEffect(() => {
    if (!open) return
    function reposition(): void {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
      const spaceAbove = rect.top - VIEWPORT_MARGIN
      const openUp = spaceBelow < MAX_MENU_HEIGHT && spaceAbove > spaceBelow
      const available = openUp ? spaceAbove : spaceBelow
      setPlacement({
        dir: openUp ? 'up' : 'down',
        maxHeight: Math.max(96, Math.min(MAX_MENU_HEIGHT, available))
      })
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value)
      setActive(idx >= 0 ? idx : 0)
    }
  }, [open, options, value])

  function commit(idx: number): void {
    const opt = options[idx]
    if (opt) onChange(opt.value)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(active)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`field ${accent === 'indigo' ? 'field-indigo' : 'field-red'} flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm outline-none`}
      >
        <span className={`truncate ${selected ? '' : 'text-white/40'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute z-50 w-full overflow-auto rounded-lg border border-white/10 bg-[#161a22] p-1 shadow-xl shadow-black/40 ${
            placement.dir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                  i === active ? 'bg-white/10' : ''
                } ${isSelected ? (accent === 'indigo' ? 'text-indigo-300' : 'text-red-300') : 'text-white/80'}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {o.label}
                  {o.hint && <span className="ml-2 text-xs text-white/35">{o.hint}</span>}
                </span>
                {isSelected && <Check size={14} className="shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
