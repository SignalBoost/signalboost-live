'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useId, useMemo, useState } from 'react'
import type { EnterpriseOption } from '@/lib/enterprise/masterConfig'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Props = {
  label: string
  options: EnterpriseOption[]
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export function SearchableMultiSelect({ label, options, values, onChange, placeholder = 'Search options', disabled }: Props) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) => `${option.label} ${option.description || ''}`.toLowerCase().includes(needle))
  }, [options, query])

  const selected = options.filter((option) => values.includes(option.value))
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])

  return <div style={{ display: 'grid', gap: 7, position: 'relative' }}>
    <label htmlFor={id} style={{ color: '#fff', fontWeight: 850, fontSize: 13 }}>{label}</label>
    <button id={id} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} style={{ minHeight: 44, width: '100%', textAlign: 'left', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(2,6,23,.78)', color: selected.length ? '#fff' : 'rgba(255,255,255,.55)', borderRadius: 12, padding: '8px 10px', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {selected.length === 0 ? uiCopy('u_8d00bbab4b697588') : <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{selected.map((option) => <span key={option.value} style={{ borderRadius: 999, background: 'rgba(26,240,255,.12)', color: '#bffaff', padding: '4px 8px', fontSize: 11 }}>{option.label}</span>)}</span>}
    </button>
    {open && !disabled && <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 6, border: '1px solid rgba(255,255,255,.15)', borderRadius: 14, padding: 8, background: '#07111f', boxShadow: '0 18px 50px rgba(0,0,0,.45)' }}>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoFocus style={{ width: '100%', border: '1px solid rgba(255,255,255,.13)', background: '#020617', color: '#fff', borderRadius: 10, padding: '9px 10px', marginBottom: 7 }} />
      <div role="listbox" aria-multiselectable="true" aria-labelledby={id} style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 4 }}>
        {filtered.map((option) => {
          const active = values.includes(option.value)
          return <button key={option.value} type="button" role="option" aria-selected={active} onClick={() => toggle(option.value)} style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', border: 'none', borderRadius: 9, padding: '9px 10px', background: active ? 'rgba(255,195,0,.16)' : 'transparent', color: '#fff', cursor: 'pointer' }}>
            <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid rgba(255,255,255,.3)', background: active ? '#ffc300' : 'transparent', color: '#000', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900 }}>{active ? '✓' : ''}</span>
            <span><strong style={{ display: 'block', fontSize: 13 }}>{option.label}</strong>{option.description && <small style={{ color: 'rgba(255,255,255,.55)' }}>{option.description}</small>}</span>
          </button>
        })}
        {filtered.length === 0 && <p style={{ color: 'rgba(255,255,255,.55)', margin: 8, fontSize: 12 }}><LocalizedText fallback={uiCopy('u_4ac50c9c7ad4f789')} /></p>}
      </div>
      <button type="button" onClick={() => { setOpen(false); setQuery('') }} style={{ width: '100%', marginTop: 7, border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, background: 'rgba(255,255,255,.06)', color: '#fff', padding: 8, cursor: 'pointer' }}>{uiCopy('u_45a9b0afc629bbd2')}</button>
    </div>}
  </div>
}
