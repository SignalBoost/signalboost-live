'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useId, useMemo, useRef, useState, useEffect } from 'react'

export default function ProviderDropdown({
  providers = [],
  value = null,
  onChange,
  loading = false,
  error = '',
  onRetry,
}) {
  const inputId = useId()
  const listboxId = `${inputId}-options`
  const rootRef = useRef(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return providers

    return providers.filter(provider => {
      const methods = Array.isArray(provider.methods) ? provider.methods.join(' ') : ''
      return `${provider.name} ${provider.id} ${methods}`.toLowerCase().includes(needle)
    })
  }, [providers, query])

  function selectProvider(provider) {
    onChange(provider)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(current => Math.min(current + 1, filtered.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex(current => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter' && open && activeIndex >= 0 && filtered[activeIndex]) {
      event.preventDefault()
      selectProvider(filtered[activeIndex])
      return
    }

    if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setActiveIndex(-1)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={inputId} className="grid gap-2 text-sm font-bold text-slate-200">
        Provider
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
          className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 text-white outline-none ring-cyan-300/40 transition focus:ring-2"
          value={open ? query : value?.name || ''}
          onFocus={() => {
            setOpen(true)
            setQuery('')
            setActiveIndex(-1)
          }}
          onChange={event => {
            setQuery(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onKeyDown={onKeyDown}
          placeholder={loading ? 'Loading providers…' : 'Search available providers'}
          aria-label="Search available providers"
        />
      </label>

      {open && (
        <div id={listboxId} role="listbox" className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-2 shadow-2xl">
          {loading && <p className="px-3 py-4 text-sm text-slate-400">Loading providers…</p>}

          {!loading && filtered.map((provider, index) => (
            <button
              id={`${listboxId}-${index}`}
              key={provider.id}
              type="button"
              role="option"
              aria-selected={provider.id === value?.id}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={event => event.preventDefault()}
              onClick={() => selectProvider(provider)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-slate-100 transition ${activeIndex === index ? 'bg-cyan-400/10' : 'hover:bg-cyan-400/10'}`}
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200">{provider.icon || '•'}</span>
              <span>
                <span className="block font-bold">{provider.name}</span>
                <span className="text-xs text-slate-400">{provider.methods?.join(' · ') || provider.defaultMethod}</span>
              </span>
            </button>
          ))}

          {!loading && !filtered.length && !error && (
            <p className="px-3 py-4 text-sm text-slate-400"><LocalizedText fallback={"No matching providers."} /></p>
          )}

          {error && (
            <div className="grid gap-2 px-3 py-3 text-sm text-amber-200">
              <span>{error}</span>
              {onRetry && (
                <button type="button" onClick={onRetry} className="w-fit rounded-lg border border-amber-300/30 px-3 py-1.5 font-bold">
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
