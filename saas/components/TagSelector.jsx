'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const FALLBACK_TAGS = ['governed', 'approval-aware', 'customer-data', 'growth-ops', 'finance', 'crm', 'audit', 'backend-only-secrets']

function normalizeTags(payload) {
  const raw = Array.isArray(payload) ? payload : Array.isArray(payload?.tags) ? payload.tags : []
  return raw
    .map(item => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') return item.id || item.value || item.label || item.name
      return ''
    })
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

export default function TagSelector({ value = [], onChange }) {
  const rootRef = useRef(null)
  const [tags, setTags] = useState([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadTags() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/tags/list', { headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error(`Tag lookup failed (${response.status})`)
        const payload = await response.json()
        const nextTags = normalizeTags(payload)
        if (!cancelled) setTags(nextTags.length ? nextTags : FALLBACK_TAGS)
      } catch (err) {
        if (!cancelled) {
          setTags(FALLBACK_TAGS)
          setError('Using local tag catalog until /tags/list is available.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadTags()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const selected = Array.isArray(value) ? value : []
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tags.filter(tag => !selected.includes(tag) && (!needle || tag.toLowerCase().includes(needle)))
  }, [query, selected, tags])

  function addTag(tag) {
    if (!selected.includes(tag)) onChange([...selected, tag])
    setQuery('')
    setOpen(true)
  }

  function removeTag(tag) {
    onChange(selected.filter(item => item !== tag))
  }

  return <div ref={rootRef} className="relative grid gap-2">
    <label htmlFor="integration-tags-combobox" className="text-sm font-bold text-slate-200">Tags</label>
    <div className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 ring-cyan-300/40 transition focus-within:ring-2">
      <div className="mb-2 flex flex-wrap gap-2">
        {selected.map(tag => <button key={tag} type="button" onClick={() => removeTag(tag)} className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-sm font-bold text-amber-100" aria-label={`Remove ${tag}`}>{tag} ×</button>)}
      </div>
      <input id="integration-tags-combobox" role="combobox" aria-expanded={open} aria-controls="integration-tags-options" aria-autocomplete="list" className="w-full bg-transparent py-1 text-white outline-none placeholder:text-slate-500" value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true) }} placeholder={selected.length ? 'Search and add another tag' : 'Search tags'} />
    </div>
    {open && <div id="integration-tags-options" role="listbox" aria-multiselectable="true" className="absolute top-full z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl">
      {loading && <p className="px-3 py-3 text-sm text-slate-400">Loading tags…</p>}
      {!loading && filtered.map(tag => <button key={tag} type="button" role="option" aria-selected={selected.includes(tag)} onClick={() => addTag(tag)} className="mr-2 mt-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20">{tag}</button>)}
      {!loading && !filtered.length && <p className="px-3 py-3 text-sm text-slate-400">No matching tags.</p>}
      {error && <p className="px-3 py-2 text-xs text-amber-200">{error}</p>}
    </div>}
  </div>
}
