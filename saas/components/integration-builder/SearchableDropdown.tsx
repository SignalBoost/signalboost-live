// saas/components/integration-builder/SearchableDropdown.tsx
'use client'

import { useId, useMemo, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import type { Option } from './mockApi.ts'

const COPY = {
  en: { select: 'Select an option', search: 'Search metadata', done: 'Done' },
  es: { select: 'Selecciona una opción', search: 'Buscar metadatos', done: 'Listo' },
  pt: { select: 'Selecione uma opção', search: 'Pesquisar metadados', done: 'Concluído' },
  pl: { select: 'Wybierz opcję', search: 'Szukaj metadanych', done: 'Gotowe' },
  ru: { select: 'Выберите вариант', search: 'Поиск метаданных', done: 'Готово' },
} as const

export default function SearchableDropdown({ label, options, value, onChange, placeholder, multiple = false }: { label: string; options: Option[]; value: string | string[]; onChange: (value: string | string[]) => void; placeholder?: string; multiple?: boolean }) {
  const { lang } = useTranslation()
  const copy = COPY[lang as keyof typeof COPY] ?? COPY.en
  const resolvedPlaceholder = placeholder ?? copy.select
  const id = useId(); const [open, setOpen] = useState(false); const [query, setQuery] = useState('')
  const values = Array.isArray(value) ? value : value ? [value] : []
  const filtered = useMemo(() => options.filter((o) => `${o.label} ${o.description || ''}`.toLowerCase().includes(query.toLowerCase())), [options, query])
  const selected = options.filter((o) => values.includes(o.id))
  function choose(idValue: string) { if (multiple) onChange(values.includes(idValue) ? values.filter((item) => item !== idValue) : [...values, idValue]); else { onChange(idValue); setOpen(false) } }
  return <div style={{ display: 'grid', gap: 8, position: 'relative' }}>
    <label htmlFor={id} style={{ color: '#fff', fontWeight: 850, fontSize: 13 }}>{label}</label>
    <button id={id} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox" style={{ minHeight: 46, width: '100%', textAlign: 'left', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(2,6,23,.78)', color: selected.length ? '#fff' : 'rgba(255,255,255,.55)', borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
      {selected.length ? <span style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{selected.map((item) => <span key={item.id} style={{ border: '1px solid rgba(26,240,255,.24)', background: 'rgba(26,240,255,.1)', borderRadius: 999, padding: '4px 8px', fontSize: 12 }}>{item.icon} {item.label}</span>)}</span> : resolvedPlaceholder}
    </button>
    {open && <div style={{ position: 'absolute', zIndex: 40, top: '100%', left: 0, right: 0, marginTop: 6, padding: 8, border: '1px solid rgba(255,255,255,.16)', borderRadius: 16, background: '#07111f', boxShadow: '0 24px 70px rgba(0,0,0,.5)' }}>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={copy.search} autoFocus style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(255,255,255,.13)', borderRadius: 12, background: '#020617', color: '#fff', padding: '10px 11px', marginBottom: 8 }} />
      <div role="listbox" aria-multiselectable={multiple} style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 4 }}>{filtered.map((option) => <button key={option.id} type="button" role="option" aria-selected={values.includes(option.id)} onClick={() => choose(option.id)} style={{ textAlign: 'left', border: 0, borderRadius: 12, padding: 10, background: values.includes(option.id) ? 'rgba(255,195,0,.16)' : 'transparent', color: '#fff', cursor: 'pointer' }}><strong>{option.icon} {option.label}</strong>{option.description && <small style={{ display: 'block', color: 'rgba(255,255,255,.58)', marginTop: 3 }}>{option.description}</small>}</button>)}</div>
      <button type="button" onClick={() => setOpen(false)} style={{ width: '100%', marginTop: 8, border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, background: 'rgba(255,255,255,.06)', color: '#fff', padding: 8 }}>{copy.done}</button>
    </div>}
  </div>
}
