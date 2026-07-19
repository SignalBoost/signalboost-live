'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

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
  const inputId = useId()
  const listboxId = `${inputId}-options`
  const rootRef = useRef(null)
  const [tags, setTags] = useState([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  async function loadTags() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/tags/list', {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`Tag lookup failed (${response.status})`)
      const nextTags = normalizeTags(await response.json())
      setTags(nextTags)
    } catch (loadError) {
      setTags([])
      setError(loadError instanceof Error ? loadError.message : 'Tag catalog is unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTags()
  }, [])

  useEffect(() => {
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
      }
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
    if (!tags.includes(tag) || selected.includes(tag)) return
    onChange([...selected, tag])
    setQuery('')
    setOpen(true)
    setActiveIndex(-1)
  }

  function removeTag(tag) {
    onChange(selected.filter(item => item !== tag))
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(current => Math.min(current + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(current => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && open && activeIndex >= 0 && filtered[activeIndex]) {
      event.preventDefault()
      addTag(filtered[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setActiveIndex(-1)
    }
  }

  return (
    <div ref={rootRef} className="relative grid gap-2">
      <label htmlFor={inputId} className="text-sm font-bold text-slate-200">Tags</label>
      <div className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 ring-cyan-300/40 transition focus-within:ring-2">
        {!!selected.length && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selected.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-sm font-bold text-amber-100"
                aria-label={`Remove ${tag}`}
              >
                {tag} ×
              </button>
            ))}
          </div>
        )}
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
          className="w-full bg-transparent py-1 text-white outline-none placeholder:text-slate-500"
          value={query}
          onFocus={() => {
            setOpen(true)
            setActiveIndex(-1)
          }}
          onChange={event => {
            setQuery(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onKeyDown={onKeyDown}
          placeholder={selected.length ? 'Filter and select another tag' : 'Filter available tags'}
        />
      </div>

      {open && (
        <div id={listboxId} role="listbox" aria-multiselectable="true" className="absolute top-full z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl">
          {loading && <p className="px-3 py-3 text-sm text-slate-400">Loading tags…</p>}
          {!loading && filtered.map((tag, index) => (
            <button
              id={`${listboxId}-${index}`}
              key={tag}
              type="button"
              role="option"
              aria-selected={false}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => addTag(tag)}
              className={`mr-2 mt-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-sm font-semibold text-cyan-100 transition ${activeIndex === index ? 'bg-cyan-300/20' : 'hover:bg-cyan-300/20'}`}
            >
              {tag}
            </button>
          ))}
          {!loading && !filtered.length && !error && <p className="px-3 py-3 text-sm text-slate-400"><LocalizedText fallback={"No matching tags."} /></p>}
          {error && (
            <div className="grid gap-2 px-3 py-3 text-sm text-amber-200">
              <span>{error}</span>
              <button type="button" onClick={loadTags} className="w-fit rounded-lg border border-amber-300/30 px-3 py-1.5 font-bold">Retry</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
