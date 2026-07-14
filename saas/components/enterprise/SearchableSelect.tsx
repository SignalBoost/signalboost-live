'use client'

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
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) => `${option.label} ${option.description || ''}`.toLowerCase().includes(needle))
  }, [options, query])

  return <div style={{ display: 'grid', gap: 7, position: 'relative' }}>
    <label htmlFor={id} style={{ color: '#fff', fontWeight: 850, fontSize: 13 }}>{label}{required ? ' *' : ''}</label>
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
      style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(2,6,23,.78)', color: selected ? '#fff' : 'rgba(255,255,255,.55)', borderRadius: 12, padding: '11px 12px', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {selected?.label || 'Select an option'}
    </button>
    {open && !disabled && <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 6, border: '1px solid rgba(255,255,255,.15)', borderRadius: 14, padding: 8, background: '#07111f', boxShadow: '0 18px 50px rgba(0,0,0,.45)' }}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        autoFocus
        style={{ width: '100%', border: '1px solid rgba(255,255,255,.13)', background: '#020617', color: '#fff', borderRadius: 10, padding: '9px 10px', marginBottom: 7 }}
      />
      <div role="listbox" aria-labelledby={id} style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 4 }}>
        {filtered.map((option) => <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          onClick={() => { onChange(option.value); setOpen(false); setQuery('') }}
          style={{ textAlign: 'left', border: 'none', borderRadius: 9, padding: '9px 10px', background: option.value === value ? 'rgba(255,195,0,.16)' : 'transparent', color: '#fff', cursor: 'pointer' }}
        >
          <strong style={{ display: 'block', fontSize: 13 }}>{option.label}</strong>
          {option.description && <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 11 }}>{option.description}</span>}
        </button>)}
        {filtered.length === 0 && <p style={{ color: 'rgba(255,255,255,.55)', margin: 8, fontSize: 12 }}>No matching options.</p>}
      </div>
    </div>}
  </div>
}
