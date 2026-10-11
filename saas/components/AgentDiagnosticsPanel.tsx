'use client'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { labIntegrationUiCopy } from '@/lib/i18n/labIntegrationUiCopy'
import { useState } from 'react'
export type StepStatus = 'ok' | 'warn' | 'fail' | 'skipped'
export type AgentDiagnostics = {
  build?: string
  search: { status: StepStatus; sourceCount: number; sources?: { id: string; title?: string; url?: string }[] }
  synthesis: { status: StepStatus; code?: string | null; model?: string | null }
  verification: { status: StepStatus; code?: string | null; rejectedDraft?: string | null }
  blocked: boolean
  reason?: string | null
  extra?: string[]
}
const explanations: Record<string, string> = {
  citation_grounding_rejected: 'The generated answer did not meet citation grounding requirements.',
  process_narration: 'The model produced source analysis or reasoning instead of a cited answer.',
  no_evidence_cited: 'No valid live-source citations were found.',
  local_synthesis_unparseable: 'Both model attempts returned no usable answer.',
  local_synthesis_failed: 'The model request failed or timed out.',
  fresh_evidence_unavailable: 'Search returned insufficient usable evidence.',
}
export const explainReason = (code?: string | null) => code ? explanations[code] || code : null
export function splitOwnerDiagnostic(reply: string): { text: string; diagnostics: AgentDiagnostics | null } {
  const marker = '— Owner diagnostic (not shown to visitors) —'
  const pos = reply.indexOf(marker)
  if (pos < 0) return { text: reply, diagnostics: null }
  const block = reply.slice(pos + marker.length)
  const build = block.match(/build:\s*(\S+)/)?.[1]
  const code = block.match(/strict synthesis:\s*([a-z_]+)(?:\s*\(([a-z_]+)\))?/i)
  const sources = Number(block.match(/sources:\s*(\d+)/)?.[1] || 0)
  const failure = code?.[1] === 'n/a' ? null : code?.[1] || null
  const reason = code?.[2] || failure
  return { text: reply.slice(0, pos).trim(), diagnostics: {
    build, search: { status: sources ? 'ok' : 'fail', sourceCount: sources },
    synthesis: { status: !failure || failure === 'citation_grounding_rejected' ? 'ok' : 'fail', code: failure === 'citation_grounding_rejected' ? null : failure },
    verification: { status: !failure ? 'ok' : failure === 'citation_grounding_rejected' ? 'fail' : 'skipped', code: failure === 'citation_grounding_rejected' ? reason : null,
      rejectedDraft: block.match(/rejected draft:\s*"([^\n]*)"/)?.[1] || null },
    blocked: Boolean(failure), reason: explainReason(reason),
  } }
}
const color: Record<StepStatus, string> = { ok: '#22c55e', warn: '#f59e0b', fail: '#ef4444', skipped: '#94a3b8' }
export default function AgentDiagnosticsPanel({ d }: { d: AgentDiagnostics }) {
  const { lang } = useTranslation()
  const copy = labIntegrationUiCopy(lang)
  const [open, setOpen] = useState(d.blocked)
  return <section style={{ marginTop: 12, border: '1px dashed #64748b', borderRadius: 10, padding: 12, fontSize: 12 }}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer' }}>
      {open ? '▾' : '▸'} {copy.u_b12f5a4246e6}
    </button>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {([['Search', d.search.status], ['Synthesis', d.synthesis.status], ['Verification', d.verification.status]] as const).map(([label,status]) =>
        <span key={label} style={{ color: color[status] }}>{label}: {status}</span>)}
    </div>
    {open && <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
      {d.blocked && <strong>{copy.u_3e75b48427ec} {explainReason(d.reason) || d.reason || copy.u_8c31b7b7c7d9}</strong>}
      <div>{copy.u_bd689c15b2ca} {d.search.sourceCount} {copy.u_1dfadd4a3ec2}</div>
      {d.search.sources?.map(s => <div key={s.id}>{s.id} — {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a> : s.title}</div>)}
      <div>{copy.u_24cda325f791} {d.synthesis.code || copy.u_070c160a6299} {d.synthesis.model ? '· ' + d.synthesis.model : ''}</div>
      <div>{copy.u_5a2bb00d9b1f} {d.verification.code || copy.u_284d1e8c4918}</div>
      {d.verification.rejectedDraft && <div>{copy.u_9ff0e96cea5b} {d.verification.rejectedDraft}</div>}
      {d.extra?.map((line,i) => <div key={i}>{line}</div>)}
      {d.build && <div>{copy.u_f9fd8a28cf11} {d.build}</div>}
    </div>}
  </section>
}
