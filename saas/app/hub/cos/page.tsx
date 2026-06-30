'use client'

// saas/app/hub/cos/page.tsx
// COS Decision Log — owner/admin view of every reasoning decision COS has made,
// with one-click outcome marking. Reads /api/cos/decisions; writes outcomes to
// /api/cos/decisions/outcome. All text flows through t() with English fallbacks.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'

type Decision = {
  decision_id: string
  objective: string
  channel: string
  state: string
  required_source: string
  must_use_tool: boolean
  proposes_action: boolean
  required_approval: boolean
  approval_reasons: string[]
  confidence: number | null
  output: any
  status: string
  created_at: string
}

type ListResponse = { ok: boolean; rows?: Decision[]; error?: string }

const CARD = 'rounded-md border border-border bg-surface'
const BTN = 'inline-flex items-center justify-center rounded-md border px-2.5 py-1 text-xs font-medium transition-fast disabled:opacity-50'

const STATE_COLOR: Record<string, string> = {
  BLOCKED: '#ef4444',
  ANALYZE_ONLY: '#94a3b8',
  RETRIEVE_AND_ANSWER: '#1af0ff',
  PREPARE_AND_HOLD: '#ffc300',
  EXECUTE: '#22c55e',
}
const STATUS_COLOR: Record<string, string> = {
  logged: '#94a3b8',
  approved: '#22c55e',
  rejected: '#ef4444',
  executed: '#1af0ff',
  measured: '#ffc300',
}

function Chip({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      color: '#0b1020', background: color, whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

export default function CosDecisionLogPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cos/decisions?limit=100', { credentials: 'include' })
      const data: ListResponse = await res.json()
      if (!data.ok) { setError(data.error || 'Failed to load'); setRows([]) }
      else setRows(data.rows || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setOutcome = useCallback(async (decisionId: string, status: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/cos/decisions/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decisionId, status }),
      })
      const data = await res.json()
      if (data.ok) {
        setRows((prev) => prev.map((r) => r.decision_id === decisionId ? { ...r, status } : r))
        setSelected((prev) => prev && prev.decision_id === decisionId ? { ...prev, status } : prev)
      }
    } catch {
      // non-fatal; the row simply keeps its previous status
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('cos.log.title', 'COS Decision Log')}</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {t('cos.log.subtitle', 'Every reasoning decision COS has made. Mark outcomes to build the training set.')}
          </div>
        </div>
        <button className={BTN} style={{ borderColor: '#1af0ff', color: '#1af0ff' }} onClick={load} disabled={loading}>
          {loading ? t('cos.log.loading', 'Loading…') : t('cos.log.refresh', 'Refresh')}
        </button>
      </div>

      {error && (
        <div className={CARD} style={{ padding: 12, borderColor: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className={CARD} style={{ padding: 24, textAlign: 'center', fontSize: 13, opacity: 0.7 }}>
          {t('cos.log.empty', 'No decisions logged yet. Run a COS simulation to populate this.')}
        </div>
      )}

      {rows.length > 0 && (
        <div className={CARD} style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <th style={{ padding: '10px 12px' }}>{t('cos.log.col_objective', 'Objective')}</th>
                <th style={{ padding: '10px 12px' }}>{t('cos.log.col_channel', 'Channel')}</th>
                <th style={{ padding: '10px 12px' }}>{t('cos.log.col_source', 'Source')}</th>
                <th style={{ padding: '10px 12px' }}>{t('cos.log.col_state', 'State')}</th>
                <th style={{ padding: '10px 12px' }}>{t('cos.log.col_status', 'Outcome')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.decision_id}
                  onClick={() => setSelected(r)}
                  style={{ borderTop: '1px solid rgba(148,163,184,.15)', cursor: 'pointer' }}
                >
                  <td style={{ padding: '10px 12px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.objective || '(empty)'}
                  </td>
                  <td style={{ padding: '10px 12px', opacity: 0.85 }}>{r.channel}</td>
                  <td style={{ padding: '10px 12px', opacity: 0.85 }}>{r.required_source}</td>
                  <td style={{ padding: '10px 12px' }}><Chip text={r.state} color={STATE_COLOR[r.state] || '#94a3b8'} /></td>
                  <td style={{ padding: '10px 12px' }}><Chip text={r.status} color={STATUS_COLOR[r.status] || '#94a3b8'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,.55)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border-border"
            style={{ width: 'min(560px, 100%)', height: '100%', borderLeft: '1px solid', padding: 24, overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{t('cos.log.detail', 'Decision detail')}</div>
              <button className={BTN} style={{ borderColor: 'rgba(148,163,184,.4)' }} onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('cos.log.objective', 'Objective')}</div>
              <div style={{ marginBottom: 12 }}>{selected.objective || '(empty)'}</div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Chip text={selected.state} color={STATE_COLOR[selected.state] || '#94a3b8'} />
                <Chip text={selected.status} color={STATUS_COLOR[selected.status] || '#94a3b8'} />
                <Chip text={`${selected.channel}`} color="#64748b" />
                <Chip text={selected.required_source} color="#475569" />
                {selected.must_use_tool && <Chip text={t('cos.log.tool_required', 'tool required')} color="#1af0ff" />}
                {selected.required_approval && <Chip text={t('cos.log.approval_required', 'approval required')} color="#ffc300" />}
              </div>

              {Array.isArray(selected.approval_reasons) && selected.approval_reasons.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t('cos.log.approval_reasons', 'Approval reasons')}</div>
                  <div>{selected.approval_reasons.join(', ')}</div>
                </div>
              )}

              <div style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{t('cos.log.report', 'Report')}</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'rgba(148,163,184,.10)', padding: 12, borderRadius: 8, lineHeight: 1.5 }}>
{selected.output?.report || '(no report)'}
              </pre>

              <div style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', margin: '14px 0 8px' }}>{t('cos.log.mark_outcome', 'Mark outcome')}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={BTN} style={{ borderColor: '#22c55e', color: '#22c55e' }} disabled={busy} onClick={() => setOutcome(selected.decision_id, 'approved')}>{t('cos.log.approve', 'Approved')}</button>
                <button className={BTN} style={{ borderColor: '#ef4444', color: '#ef4444' }} disabled={busy} onClick={() => setOutcome(selected.decision_id, 'rejected')}>{t('cos.log.reject', 'Rejected')}</button>
                <button className={BTN} style={{ borderColor: '#1af0ff', color: '#1af0ff' }} disabled={busy} onClick={() => setOutcome(selected.decision_id, 'executed')}>{t('cos.log.executed', 'Executed')}</button>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.55 }}>
                {t('cos.log.created', 'Logged')}: {new Date(selected.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
