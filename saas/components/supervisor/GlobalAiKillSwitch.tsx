'use client'

import { useState } from 'react'

export type GlobalAiKillSwitchLabels = {
  title: string
  active: string
  disabled: string
  description: string
  engage: string
  restore: string
  working: string
  error: string
}

export default function GlobalAiKillSwitch({ enabled: initialEnabled, labels }: { enabled: boolean; labels: GlobalAiKillSwitchLabels }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    setWorking(true); setError('')
    try {
      const response = await fetch('/api/admin/ai-execution-toggle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) })
      const payload = await response.json() as { ai_autonomous_execution_enabled?: boolean; error?: string }
      if (!response.ok || typeof payload.ai_autonomous_execution_enabled !== 'boolean') throw new Error(payload.error || labels.error)
      setEnabled(payload.ai_autonomous_execution_enabled)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : labels.error)
    } finally { setWorking(false) }
  }

  const active = enabled
  return <section style={{ border: `2px solid ${active ? '#ff5c7a' : '#38f2a4'}`, borderRadius: 22, padding: 20, marginBottom: 18, background: active ? 'rgba(255,92,122,.12)' : 'rgba(56,242,164,.12)' }}>
    <h2 style={{ marginTop: 0 }}>{labels.title}</h2>
    <p style={{ fontWeight: 800, color: active ? '#ff8ca2' : '#71ffc1' }}>{active ? labels.active : labels.disabled}</p>
    <p>{labels.description}</p>
    <button type="button" onClick={toggle} disabled={working} style={{ border: 0, borderRadius: 12, cursor: working ? 'wait' : 'pointer', padding: '14px 18px', fontWeight: 900, fontSize: 16, color: '#07111f', background: active ? '#ff5c7a' : '#38f2a4' }}>
      {working ? labels.working : active ? labels.engage : labels.restore}
    </button>
    {error ? <p role="alert" style={{ color: '#ffb3c1', fontWeight: 700 }}>{error}</p> : null}
  </section>
}
