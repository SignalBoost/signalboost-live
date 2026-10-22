// saas/components/AssistanceModeSelector.tsx
'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import {
  ASSISTANCE_MODES, ASSISTANCE_MODE_ARIA, ASSISTANCE_MODE_DESCRIPTION, ASSISTANCE_MODE_LABEL,
  assistanceCopy, type AssistanceMode,
} from '@/lib/ai/cos/assistanceMode'

const ICON: Readonly<Record<AssistanceMode, string>> = { guide: '🧭', collaborate: '🤝', autonomous: '⚡' }

/**
 * Compact chat-composer control for the user's assistance mode. The button shows the mode's icon; the menu names and
 * explains every mode. Opens upward from the composer, follows the page direction (Arabic is right-to-left).
 */
export default function AssistanceModeSelector({ mode, onChange, lang, disabled, className, style }: {
  mode: AssistanceMode
  onChange: (mode: AssistanceMode) => void
  lang: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const items = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()
  const label = `${assistanceCopy(ASSISTANCE_MODE_ARIA, lang)}: ${assistanceCopy(ASSISTANCE_MODE_LABEL[mode], lang)}`

  useEffect(() => {
    if (!open) return
    items.current[ASSISTANCE_MODES.indexOf(mode)]?.focus()
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open, mode])

  const choose = (next: AssistanceMode) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div ref={root} style={{ position: 'relative', flexShrink: 0 }}
      onKeyDown={event => {
        if (event.key === 'Escape') setOpen(false)
        if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
        event.preventDefault()
        const at = items.current.findIndex(item => item === document.activeElement)
        const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + ASSISTANCE_MODES.length) % ASSISTANCE_MODES.length
        items.current[next]?.focus()
      }}>
      <button type="button" className={className} style={style} disabled={disabled}
        aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} aria-label={label} title={label}
        data-assistance-mode={mode}
        onClick={() => setOpen(value => !value)}>
        <span aria-hidden="true">{ICON[mode]}</span>
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label={assistanceCopy(ASSISTANCE_MODE_ARIA, lang)}
          style={{ position: 'absolute', bottom: 'calc(100% + 8px)', insetInlineStart: 0, zIndex: 60, width: 'min(300px, 80vw)',
            padding: 6, borderRadius: 14, background: '#0d1424', border: '1px solid rgba(255,255,255,.14)',
            boxShadow: '0 12px 32px rgba(0,0,0,.45)', textAlign: 'start' }}>
          {ASSISTANCE_MODES.map((option, index) => (
            <button key={option} ref={element => { items.current[index] = element }} type="button"
              role="menuitemradio" aria-checked={option === mode} onClick={() => choose(option)}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', padding: '9px 10px', borderRadius: 10,
                border: 'none', cursor: 'pointer', textAlign: 'start', color: '#e8eefc',
                background: option === mode ? 'rgba(26,240,255,.12)' : 'transparent' }}>
              <span aria-hidden="true" style={{ fontSize: 16, lineHeight: '20px' }}>{ICON[option]}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{assistanceCopy(ASSISTANCE_MODE_LABEL[option], lang)}</span>
                <span style={{ fontSize: 12, lineHeight: 1.35, color: 'rgba(232,238,252,.7)' }}>{assistanceCopy(ASSISTANCE_MODE_DESCRIPTION[option], lang)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
