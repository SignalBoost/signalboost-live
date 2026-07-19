'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useId, useMemo, useState } from 'react'
import type { EnterpriseOption } from '@/lib/enterprise/masterConfig'

type Props = {
  label: string
  options: EnterpriseOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

export function SearchableSelect({ label, options, value, onChange, placeholder = 'Search options', disabled, required }: Props) {
  const id = useId()
  const listboxId = `${id}-listbox`
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) => `${option.label} ${option.description || ''}`.toLowerCase().includes(needle))
  }, [options, query])

  const choose = (option: EnterpriseOption) => {
    onChange(option.value)
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  return <div style={{ display: 'grid', gap: 7, position: 'relative' }}>
    <label htmlFor={id} style={{ color: '#fff', fontWeight: 850, fontSize: 13 }}>{label}{required ? ' *' : ''}</label>
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0))) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.max(index - 1, 0)) }
        if (event.key === 'Enter' && open && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]) }
        if (event.key === 'Escape') { setOpen(false); setQuery('') }
      }}
      style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(2,6,23,.78)', color: selected ? '#fff' : 'rgba(255,255,255,.55)', borderRadius: 12, padding: '11px 12px', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {selected?.label || 'Select an option'}
    </button>
    {open && !disabled && <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 6, border: '1px solid rgba(255,255,255,.15)', borderRadius: 14, padding: 8, background: '#07111f', boxShadow: '0 18px 50px rgba(0,0,0,.45)' }}>
      <input
        type="search"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0))) }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)) }
          if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]) }
          if (event.key === 'Escape') { setOpen(false); setQuery('') }
        }}
        aria-label={`${label} search`}
        aria-controls={listboxId}
        placeholder={placeholder}
        autoFocus
        style={{ width: '100%', border: '1px solid rgba(255,255,255,.13)', background: '#020617', color: '#fff', borderRadius: 10, padding: '9px 10px', marginBottom: 7 }}
      />
      <div id={listboxId} role="listbox" aria-labelledby={id} style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 4 }}>
        {filtered.map((option, index) => <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => choose(option)}
          style={{ textAlign: 'left', border: 'none', borderRadius: 9, padding: '9px 10px', background: option.value === value ? 'rgba(255,195,0,.16)' : index === activeIndex ? 'rgba(26,240,255,.12)' : 'transparent', color: '#fff', cursor: 'pointer' }}
        >
          <strong style={{ display: 'block', fontSize: 13 }}>{option.label}</strong>
          {option.description && <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 11 }}>{option.description}</span>}
        </button>)}
        {filtered.length === 0 && <p role="status" style={{ color: 'rgba(255,255,255,.55)', margin: 8, fontSize: 12 }}><LocalizedText fallback={"No matching options."} /></p>}
      </div>
    </div>}
  </div>
}
