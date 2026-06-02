import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  hint?: string
}

/**
 * Custom dropdown that replaces the native <select>. Styled to match the app,
 * closes on outside click or Escape, and supports basic keyboard navigation.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = ''
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
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
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#12151c] px-3 py-2 text-left text-sm outline-none transition hover:border-white/20 focus:border-red-500/50"
      >
        <span className={`truncate ${selected ? '' : 'text-white/40'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/10 bg-[#161a22] p-1 shadow-xl shadow-black/40"
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
                } ${isSelected ? 'text-red-300' : 'text-white/80'}`}
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
