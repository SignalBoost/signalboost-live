// saas/components/supervisor/GlobalAiKillSwitch.tsx
//
// THREE states, not two. The middleware in saas/proxy.ts admits a request only when it can
// read system_status.ai_autonomous_execution_enabled === true with the ANON key: a missing
// table, a missing row, an RLS denial or any error all mean BLOCKED. This banner used to
// compute `!== false`, so an unreadable row rendered as "AI AUTONOMY ACTIVE" while every
// supervisor webhook was getting a 503. The two now agree, and the third state says plainly
// that the switch itself cannot be read rather than pretending someone engaged it.
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
