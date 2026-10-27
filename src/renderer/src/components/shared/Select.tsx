import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
/** Gap between the trigger and the menu. */
const MENU_GAP = 4

/** Viewport-fixed geometry for the open menu, measured from the trigger. */
interface MenuPlacement {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

/**
 * Custom dropdown that replaces the native <select>: a square ruled trigger
 * whose border takes the section color while open, over a raised panel menu.
 * Closes on outside click or Escape and supports basic keyboard navigation.
 * The menu renders in a portal at a fixed viewport position, so scrolling or
 * clipped containers (cards, panels with their own scroll) never cut it off.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
  accent = 'red',
  ariaLabel
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  /** Color of the selected option; the menu renders in a portal outside the section. */
  accent?: 'red' | 'indigo'
  ariaLabel?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent): void {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  /*
   * Decide whether the menu opens downward or upward based on the space left
   * around the trigger. Opens up only when the space below is too tight AND
   * there is more room above; the menu height is then clamped to whatever the
   * chosen side can fit so it never spills past the window edge. Re-measured
   * on scroll and resize so the fixed menu stays attached to its trigger.
   */
  useLayoutEffect(() => {
    if (!open) return
    function reposition(): void {
      const el = rootRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN - MENU_GAP
      const spaceAbove = rect.top - VIEWPORT_MARGIN - MENU_GAP
      const openUp = spaceBelow < MAX_MENU_HEIGHT && spaceAbove > spaceBelow
      const available = openUp ? spaceAbove : spaceBelow
      setPlacement({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(96, Math.min(MAX_MENU_HEIGHT, available)),
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + MENU_GAP }
          : { top: rect.bottom + MENU_GAP })
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
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-sm border bg-transparent px-3 py-2.5 text-left text-sm text-[var(--t-fg)] transition-colors ${
          open
            ? 'border-[var(--t-accent)]'
            : 'border-[var(--t-rule-strong)] hover:border-[var(--t-dim)]'
        }`}
      >
        <span className={`truncate ${selected ? '' : 'text-[var(--t-faint)]'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-[var(--t-dim)] transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        placement &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{ position: 'fixed', ...placement }}
            className="sheet scroll-ink z-[60] overflow-auto rounded-sm border border-[var(--t-rule-strong)] py-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.55)]"
          >
            {options.map((o, i) => {
              const isSelected = o.value === value
              const selectedTone =
                accent === 'indigo' ? 'text-[var(--t-blue)]' : 'text-[var(--t-red)]'
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 py-2 pl-3 pr-[2px] text-sm ${
                    i === active ? 'bg-[var(--t-hover)]' : ''
                  } ${isSelected ? `font-semibold ${selectedTone}` : 'text-[var(--t-fg)]'}`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {o.label}
                    {o.hint && (
                      <span className="ml-2 text-xs font-normal text-[var(--t-dim)]">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check size={14} className="shrink-0" />}
                </li>
              )
            })}
          </ul>,
          document.body
        )}
    </div>
  )
}
