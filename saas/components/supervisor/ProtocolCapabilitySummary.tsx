'use client'

import { useEffect, useState } from 'react'

type Snapshot = {
  summary: {
    protocols: number
    mutatingProtocols: number
    supervisoryOnlyProtocols: number
    safetyClassifiedProtocols: number
  }
  safety: {
    readOnly: true
    executionControlsExposed: false
    mutationControlsExposed: false
  }
}

export default function ProtocolCapabilitySummary() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/internal/supervisor/protocol-capabilities', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted && data?.summary) setSnapshot(data) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  if (!snapshot) return null

  return (
    <aside aria-label="Protocol capability summary" style={box}>
      <strong>{snapshot.summary.protocols} protocols</strong>
      <span>{snapshot.summary.safetyClassifiedProtocols} safety-classified</span>
      <span>{snapshot.summary.supervisoryOnlyProtocols} supervisory-only</span>
      <span>{snapshot.summary.mutatingProtocols} declare mutation capability</span>
      <span style={safe}>Read-only · no execution controls</span>
    </aside>
  )
}

const box = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
  padding: '8px 24px',
  borderBottom: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(8,16,28,.92)',
  color: 'rgba(255,255,255,.72)',
  fontSize: 11,
} as const

const safe = { color: '#38f2a4', fontWeight: 800 } as const
