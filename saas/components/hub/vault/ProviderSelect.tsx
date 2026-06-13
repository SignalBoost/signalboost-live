'use client'

// saas/components/hub/vault/ProviderSelect.tsx
// Searchable provider dropdown — type to filter, click to select.

import { useMemo, useState, useRef, useEffect } from 'react'
import { HUB_PROVIDERS } from '@/lib/hub/provider-registry'

export type ProviderSelectProps = {
  onSelect: (providerId: string, providerName: string) => void
  placeholder?: string
  selectedId?: string | null
}

export default function ProviderSelect({
  onSelect,
  placeholder = 'Search providers...',
  selectedId,
}: ProviderSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return HUB_PROVIDERS
    const q = search.toLowerCase()
    return HUB_PROVIDERS.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
  }, [search])

  const selected = selectedId ? HUB_PROVIDERS.find(p => p.id === selectedId) : null

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        setHighlighted(prev => (prev + 1) % filtered.length)
        e.preventDefault()
        break
      case 'ArrowUp':
        setHighlighted(prev => (prev - 1 + filtered.length) % filtered.length)
        e.preventDefault()
        break
      case 'Enter':
        if (filtered[highlighted]) {
          handleSelect(filtered[highlighted].id, filtered[highlighted].name)
        }
        e.preventDefault()
        break
      case 'Escape':
        setOpen(false)
        e.preventDefault()
        break
      default:
        break
    }
  }

  const handleSelect = (providerId: string, providerName: string) => {
    onSelect(providerId, providerName)
    setSearch('')
    setOpen(false)
    setHighlighted(0)
  }

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={selected && !open ? selected.name : search}
        onChange={e => {
          setSearch(e.target.value)
          setOpen(true)
          setHighlighted(0)
        }}
        onFocus={() => {
          setOpen(true)
          if (selected) setSearch('')
        }}
        onKeyDown={handleKeyDown}
        placeholder={selected && !open ? '' : placeholder}
        style={{
          width: '100%',
          padding: '11px 12px',
          borderRadius: 10,
          border: open ? '1px solid rgba(26,240,255,.4)' : '1px solid rgba(255,255,255,.15)',
          background: 'rgba(255,255,255,.04)',
          color: '#fff',
          fontSize: 14,
          outline: 'none',
          transition: 'border-color .2s',
          cursor: 'text',
        }}
      />

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            borderRadius: 10,
            border: '1px solid rgba(26,240,255,.3)',
            background: 'rgba(7,7,13,.95)',
            backdropFilter: 'blur(8px)',
            maxHeight: 320,
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          }}
        >
          {filtered.map((provider, idx) => (
            <button
              key={provider.id}
              onClick={() => handleSelect(provider.id, provider.name)}
              onMouseEnter={() => setHighlighted(idx)}
              style={{
                display: 'block',
                width: '100%',
                padding: '11px 12px',
                textAlign: 'left',
                background:
                  idx === highlighted ? 'rgba(26,240,255,.12)' : idx === 0 ? 'rgba(26,240,255,.06)' : 'transparent',
                border: 'none',
                borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none',
                color: idx === highlighted ? '#1af0ff' : '#fff',
                fontSize: 13,
                fontWeight: idx === highlighted ? 600 : 500,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>📌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{provider.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>
                    {provider.category}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(255,255,255,.08)',
                    color: 'rgba(255,255,255,.6)',
                  }}
                >
                  {provider.tier}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {open && search && filtered.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            padding: 12,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,.1)',
            background: 'rgba(7,7,13,.95)',
            textAlign: 'center',
            fontSize: 12,
            color: 'rgba(255,255,255,.5)',
          }}
        >
          No providers match "{search}"
        </div>
      )}
    </div>
  )
}
