'use client'

// saas/components/admin/SearchableSelect.tsx
// Secure searchable dropdown for vault item references. It renders only labels,
// metadata, and ids; it never renders or transports plaintext secret values.

import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchableOption = {
  id: string
  label: string
  meta?: string
}

export type SearchableSelectProps = {
  options: SearchableOption[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder: string
  emptyText: string
  loading?: boolean
  loadingText?: string
  disabled?: boolean
  ariaLabel?: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  loading = false,
  loadingText = '…',
  disabled = false,
  ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const selected = useMemo(() => options.find((option) => option.id === value) || null, [options, value])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) => option.label.toLowerCase().includes(q) || (option.meta || '').toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => { setHighlight(0) }, [query, open])

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true)
      event.preventDefault()
      return
    }
    if (!open) return
    if (event.key === 'Escape') {
      setOpen(false)
      event.preventDefault()
    } else if (event.key === 'ArrowDown') {
      setHighlight((value) => Math.min(value + 1, Math.max(0, filtered.length - 1)))
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      setHighlight((value) => Math.max(value - 1, 0))
      event.preventDefault()
    } else if (event.key === 'Enter') {
      const option = filtered[highlight]
      if (option) pick(option.id)
      event.preventDefault()
    }
  }

  return (
    <div ref={rootRef} className="relative w-full" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm"
        style={{
          background: '#0a1a2e',
          color: selected ? '#e8f6ff' : '#6f88a3',
          border: `1px solid ${open ? 'rgba(26,240,255,0.55)' : 'rgba(26,240,255,0.22)'}`,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
          {selected?.meta ? <span className="ml-2 text-xs" style={{ color: '#6f88a3', fontFamily: 'var(--sb-font-mono)' }}>{selected.meta}</span> : null}
        </span>
        <span aria-hidden style={{ color: '#1af0ff' }}>{open ? '▴' : '▾'}</span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg" style={{ background: '#07111f', border: '1px solid rgba(26,240,255,0.35)', boxShadow: '0 14px 40px rgba(0,0,0,0.6)' }}>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-sm outline-none"
            style={{ background: '#0a1a2e', color: '#e8f6ff', borderBottom: '1px solid rgba(26,240,255,0.18)' }}
          />
          <ul role="listbox" className="max-h-56 overflow-y-auto">
            {loading ? (
              <li className="px-3 py-3 text-sm" style={{ color: '#6f88a3' }}>{loadingText}</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm" style={{ color: '#6f88a3' }}>{emptyText}</li>
            ) : filtered.map((option, index) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(option.id)}
                className="cursor-pointer px-3 py-2 text-sm"
                style={{ background: index === highlight ? 'rgba(26,240,255,0.10)' : 'transparent', color: option.id === value ? '#ffc300' : '#e8f6ff' }}
              >
                <span className="block truncate">{option.label}</span>
                {option.meta ? <span className="block truncate text-xs" style={{ color: '#6f88a3', fontFamily: 'var(--sb-font-mono)' }}>{option.meta}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
