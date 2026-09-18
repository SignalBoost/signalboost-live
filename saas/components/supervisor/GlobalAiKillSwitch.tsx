// saas/components/supervisor/GlobalAiKillSwitch.tsx
//
// THREE states, not two. The ingress gate reads system_status.ai_autonomous_execution_enabled
// with the ANON key. Missing config/row, RLS/auth failure, or an unreadable cold start remains
// BLOCKED. A warm instance may reuse only a very recent explicit state for a bounded 30-second
// grace during a transport/429/5xx failure so a transient control-plane stall cannot fan out into
// platform-wide cron 503s. This banner still reports the database state itself, including unavailable.
'use client'

import { useState } from 'react'

/** active = autonomy running · engaged = kill switch on · unavailable = status unreadable, treated as blocked. */
export type GlobalAiKillSwitchState = 'active' | 'engaged' | 'unavailable'

export type GlobalAiKillSwitchLabels = {
  title: string
  active: string
  disabled: string
  description: string
  engage: string
  restore: string
  working: string
  error: string
  // Optional for the same transition reason as `enabled` below: the page supplies all three.
  unavailable?: string
  unavailableDescription?: string
  unavailableAction?: string
}

// `enabled` is the superseded two-state prop, kept optional purely so this file can be
// committed before app/dashboard/supervisor/page.tsx without a red build in between. Once
// the page is on main, nothing passes it. Do not add new callers.
export default function GlobalAiKillSwitch({ state: initialState, enabled, labels }: { state?: GlobalAiKillSwitchState; enabled?: boolean; labels: GlobalAiKillSwitchLabels }) {
  const [state, setState] = useState<GlobalAiKillSwitchState>(initialState || (enabled === true ? 'active' : 'engaged'))
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    // The POST updates an existing row. With the row unreadable there is nothing to update,
    // so the button stays disabled instead of returning a 503 the operator has to decode.
    if (state === 'unavailable' || working) return
    const next = state !== 'active'
    setWorking(true); setError('')
    try {
      const response = await fetch('/api/admin/ai-execution-toggle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: next }) })
      const payload = await response.json() as { ai_autonomous_execution_enabled?: boolean; error?: string }
      if (!response.ok || typeof payload.ai_autonomous_execution_enabled !== 'boolean') throw new Error(payload.error || labels.error)
      setState(payload.ai_autonomous_execution_enabled === true ? 'active' : 'engaged')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.error)
    } finally { setWorking(false) }
  }

  const unavailable = state === 'unavailable'
  const active = state === 'active'
  const accent = unavailable ? '#ffb020' : active ? '#ff5c7a' : '#38f2a4'
  const tint = unavailable ? 'rgba(255,176,32,.12)' : active ? 'rgba(255,92,122,.12)' : 'rgba(56,242,164,.12)'
  const headline = unavailable ? (labels.unavailable || labels.disabled) : active ? labels.active : labels.disabled
  const headlineColor = unavailable ? '#ffcf7a' : active ? '#ff8ca2' : '#71ffc1'

  return <section style={{ border: `2px solid ${accent}`, borderRadius: 22, padding: 20, marginBottom: 18, background: tint }}>
    <h2 style={{ marginTop: 0 }}>{labels.title}</h2>
    <p style={{ fontWeight: 800, color: headlineColor }}>{headline}</p>
    <p>{unavailable ? (labels.unavailableDescription || labels.description) : labels.description}</p>
    {unavailable
      ? <p role="alert" style={{ fontWeight: 700, color: '#ffcf7a' }}>{labels.unavailableAction || labels.error}</p>
      : <button type="button" onClick={toggle} disabled={working} style={{ border: 0, borderRadius: 12, cursor: working ? 'wait' : 'pointer', padding: '14px 18px', fontWeight: 900, fontSize: 16, color: '#07111f', background: accent }}>
          {working ? labels.working : active ? labels.engage : labels.restore}
        </button>}
    {error ? <p role="alert" style={{ color: '#ffb3c1', fontWeight: 700 }}>{error}</p> : null}
  </section>
}
