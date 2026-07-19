'use client'

import { useState } from 'react'
import AuditFixConsent from '@/components/audit/AuditFixConsent'
import type { PatchFinding } from '@/components/audit/PatchPreview'
import { useTranslation } from '@/components/i18n/useTranslation'

type Status = { finding: PatchFinding; state: 'waiting' | 'applying' | 'fixed' | 'skipped'; detail?: string }

export default function GlobalFixApproval({ runId, findings, lang, onComplete }: { runId: string | null; findings: PatchFinding[]; lang: string; onComplete?: () => void }) {
  const { t } = useTranslation()
  const [statuses, setStatuses] = useState<Status[]>([])
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<{ filesFixed: number; findingsFixed: number; timestamp: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function approveAll() {
    if (!runId || busy) return
    setBusy(true); setError(null)
    const started = await fetch('/api/hub/operator/audit/fix-batch', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, action: 'approve' }) })
    const startData = await started.json().catch(() => null)
    if (!started.ok || !startData?.ok) { setError(startData?.error || t('audit.batch.approveFailed', 'Could not approve fixes for this run.')); setBusy(false); return }
    const next = findings.map(finding => ({ finding, state: 'waiting' as const }))
    setStatuses(next)
    const events: { file: string; line?: number | null; action: string; timestamp: string }[] = []
    for (let index = 0; index < findings.length; index++) {
      const finding = findings[index]
      setStatuses(current => current.map((status, i) => i === index ? { ...status, state: 'applying' } : status))
      try {
        const previewRes = await fetch('/api/hub/operator/audit/patch', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'preview', file: finding.file, line: finding.line, category: finding.category, title: finding.title, detail: finding.detail, recommendation: finding.recommendation }) })
        const preview = await previewRes.json().catch(() => null)
        if (!previewRes.ok || !preview?.ok) throw new Error(preview?.error || 'Preview failed')
        const commitRes = await fetch('/api/hub/operator/audit/patch', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'commit', file: preview.path, content: preview.newContent, title: preview.title, baseHash: preview.baseHash }) })
        const commit = await commitRes.json().catch(() => null)
        if (!commitRes.ok || !commit?.ok) throw new Error(commit?.error || 'Commit failed')
        events.push({ file: finding.file, line: finding.line, action: 'fix_applied', timestamp: new Date().toISOString() })
        setStatuses(current => current.map((status, i) => i === index ? { ...status, state: 'fixed', detail: commit.compareUrl } : status))
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : 'Fix could not be applied'
        events.push({ file: finding.file, line: finding.line, action: 'fix_skipped', timestamp: new Date().toISOString() })
        setStatuses(current => current.map((status, i) => i === index ? { ...status, state: 'skipped', detail } : status))
      }
    }
    const completed = await fetch('/api/hub/operator/audit/fix-batch', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, action: 'complete', events }) })
    const completeData = await completed.json().catch(() => null)
    if (completed.ok && completeData?.ok) { setSummary(completeData.summary); onComplete?.() } else setError(completeData?.error || t('audit.batch.completeFailed', 'Fixes were processed but the summary could not be saved.'))
    setBusy(false)
  }

  return <div className="mt-4">
    {!summary && <AuditFixConsent count={findings.length} lang={lang} onAccept={approveAll} />}
    {(busy || statuses.length > 0) && <section className="rounded-md border border-border bg-surface p-4" aria-live="polite">
      <div className="mb-2 flex items-center justify-between text-sm font-semibold text-text"><span>{t('audit.batch.progress', 'Applying approved fixes')}</span><span>{statuses.filter(status => status.state === 'fixed' || status.state === 'skipped').length}/{findings.length}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-bg"><div className="h-full bg-accent transition-all" style={{ width: `${findings.length ? (statuses.filter(status => status.state === 'fixed' || status.state === 'skipped').length / findings.length) * 100 : 0}%` }} /></div>
      <ul className="mt-3 space-y-1 text-xs text-text-muted">{statuses.map((status, index) => <li key={`${status.finding.file}-${index}`}>{status.state === 'fixed' ? '✓' : status.state === 'skipped' ? '!' : status.state === 'applying' ? '…' : '○'} {status.finding.file}{status.finding.line ? `:${status.finding.line}` : ''} — {status.state === 'fixed' ? t('audit.batch.fixed', 'fixed') : status.state === 'skipped' ? status.detail : t('audit.batch.applying', 'applying')}</li>)}</ul>
    </section>}
    {summary && <div className="rounded-md border border-[#86efac]/40 bg-surface p-4 text-sm text-[#86efac]">{t('audit.batch.completed', 'Completed')}: {summary.findingsFixed} {t('audit.batch.findingsFixed', 'findings fixed')} · {summary.filesFixed} {t('audit.batch.filesFixed', 'files fixed')} · {summary.timestamp}</div>}
    {error && <p className="mt-2 text-sm text-danger">{error}</p>}
  </div>
}
