'use client'

import { useEffect, useState } from 'react'
import {
  type ProtocolDiagnosticsSnapshot,
  validateProtocolDiagnosticsSnapshot,
} from '@/lib/supervisor/protocol-diagnostics-client'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Labels = { protocols: string; safety: string; supervisory: string; mutating: string; safe: string }

export default function ProtocolCapabilitySummary({ labels }: { labels: Labels }) {
  const [snapshot, setSnapshot] = useState<ProtocolDiagnosticsSnapshot | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/internal/supervisor/protocol-capabilities', { method: 'GET', cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        const validated = validateProtocolDiagnosticsSnapshot(data)
        if (!controller.signal.aborted && validated) setSnapshot(validated)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  if (!snapshot) return null

  return <aside aria-label={uiCopy('u_26ac1a8ed80135ec')} style={box}>
    <strong>{snapshot.summary.protocols} {labels.protocols}</strong>
    <span>{snapshot.summary.safetyClassifiedProtocols} {labels.safety}</span>
    <span>{snapshot.summary.supervisoryOnlyProtocols} {labels.supervisory}</span>
    <span>{snapshot.summary.mutatingProtocols} {labels.mutating}</span>
    <span style={safe}>{labels.safe}</span>
  </aside>
}

const box = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '8px 24px', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,16,28,.92)', color: 'rgba(255,255,255,.72)', fontSize: 11 } as const
const safe = { color: '#38f2a4', fontWeight: 800 } as const
