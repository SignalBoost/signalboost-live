'use client'

import { useState } from 'react'

type Copy = {
  killSwitchTitle: string
  killSwitchDescription: string
  killSwitchEnabled: string
  killSwitchDisabled: string
  killSwitchButton: string
  killSwitchEngaging: string
  killSwitchEngaged: string
  killSwitchError: string
}

export function GlobalAiKillSwitch({ copy, initiallyEnabled }: { copy: Copy; initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function engage() {
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/admin/kill-switch', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error()
      setEnabled(false)
    } catch {
      setError(copy.killSwitchError)
    } finally {
      setSubmitting(false)
    }
  }

  return <section style={panel} aria-live="polite">
    <div>
      <h2 style={{ margin: '0 0 6px' }}>{copy.killSwitchTitle}</h2>
      <p style={description}>{copy.killSwitchDescription}</p>
      <strong style={{ color: enabled ? '#b8ffdd' : '#ff9aaa' }}>{enabled ? copy.killSwitchEnabled : copy.killSwitchDisabled}</strong>
      {error ? <p style={errorStyle}>{error}</p> : null}
    </div>
    <button type="button" onClick={engage} disabled={!enabled || submitting} style={{ ...button, opacity: !enabled || submitting ? .65 : 1 }}>
      {submitting ? copy.killSwitchEngaging : enabled ? copy.killSwitchButton : copy.killSwitchEngaged}
    </button>
  </section>
}

const panel = { border: '2px solid #ff3b52', borderRadius: 22, padding: 20, background: 'rgba(145, 10, 30, .22)', marginBottom: 18, display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const }
const description = { margin: '0 0 10px', color: 'rgba(255,255,255,.8)', maxWidth: 760 }
const button = { border: 'none', borderRadius: 14, padding: '15px 19px', background: '#e11d48', color: '#fff', cursor: 'pointer', fontWeight: 900, fontSize: 15, boxShadow: '0 0 0 4px rgba(255, 59, 82, .18)' }
const errorStyle = { color: '#ffb4c0', marginBottom: 0 }
