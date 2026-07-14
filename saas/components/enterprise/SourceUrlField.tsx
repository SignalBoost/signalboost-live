'use client'

import { useId, useMemo } from 'react'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  loading?: boolean
  error?: string
  helperText?: string
  required?: boolean
}

export function normalizeSourceUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function validateSourceUrl(value: string): string | null {
  if (!value.trim()) return 'Enter a website or GitHub URL.'
  try {
    const parsed = new URL(normalizeSourceUrl(value))
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'Only HTTP and HTTPS URLs are supported.'
    if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) return 'Use a publicly accessible URL.'
    return null
  } catch {
    return 'Enter a valid URL.'
  }
}

export function SourceUrlField({ label, value, onChange, onSubmit, loading, error, helperText, required }: Props) {
  const id = useId()
  const localError = useMemo(() => value ? validateSourceUrl(value) : null, [value])
  const displayedError = error || localError

  return <div style={{ display: 'grid', gap: 7 }}>
    <label htmlFor={id} style={{ color: '#fff', fontWeight: 850, fontSize: 13 }}>{label}{required ? ' *' : ''}</label>
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => value && onChange(normalizeSourceUrl(value))}
        placeholder="https://example.com or https://github.com/org/repo"
        aria-invalid={Boolean(displayedError)}
        aria-describedby={`${id}-help`}
        style={{ minWidth: 260, flex: 1, border: displayedError ? '1px solid #fca5a5' : '1px solid rgba(255,255,255,.14)', background: 'rgba(2,6,23,.78)', color: '#fff', borderRadius: 12, padding: '11px 12px' }}
      />
      {onSubmit && <button type="button" disabled={loading || Boolean(validateSourceUrl(value))} onClick={onSubmit} style={{ border: 'none', borderRadius: 12, background: '#ffc300', color: '#000', padding: '10px 14px', fontWeight: 900, cursor: loading ? 'wait' : 'pointer', opacity: loading || Boolean(validateSourceUrl(value)) ? .55 : 1 }}>{loading ? 'Analyzing…' : 'Analyze source'}</button>}
    </div>
    <p id={`${id}-help`} style={{ margin: 0, color: displayedError ? '#fca5a5' : 'rgba(255,255,255,.55)', fontSize: 11 }}>{displayedError || helperText || 'The server will validate and extract metadata before using this source.'}</p>
  </div>
}
