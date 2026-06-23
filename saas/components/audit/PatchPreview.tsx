'use client'

// saas/components/audit/PatchPreview.tsx
// Pre-patch trust flow for a single audit finding:
//   Generate preview (NO write) → show code diff + plain-English Before/After →
//   "🚀 Confirm & Push Pull Request" → commit to an ai/* branch → Review & Merge ↗.
// Self-contained: owns the two-phase call to /api/hub/operator/audit/patch
// (mode:'preview' then mode:'commit'). Tokens: bg-surface / bg-bg / border-border.

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'

export type PatchFinding = {
  file: string
  line?: number | null
  title: string
  detail?: string
  recommendation?: string
}

type Phase = 'idle' | 'previewing' | 'preview' | 'committing' | 'done' | 'error'

type PreviewData = {
  path: string
  title: string
  oldContent: string
  newContent: string
  before: string
  after: string
}

type DiffRow = { t: 'ctx' | 'add' | 'del'; a?: number; b?: number; text: string }

// LCS line diff (guarded for very large files so the drawer never locks up).
function diffLines(oldStr: string, newStr: string): DiffRow[] {
  const a = String(oldStr || '').replace(/\n$/, '').split('\n')
  const b = String(newStr || '').replace(/\n$/, '').split('\n')
  const n = a.length, m = b.length
  if (n > 1500 || m > 1500) {
    return [
      ...a.map((text, i) => ({ t: 'del' as const, a: i + 1, text })),
      ...b.map((text, i) => ({ t: 'add' as const, b: i + 1, text })),
    ]
  }
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const out: DiffRow[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: 'ctx', a: i + 1, b: j + 1, text: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', a: i + 1, text: a[i] }); i++ }
    else { out.push({ t: 'add', b: j + 1, text: b[j] }); j++ }
  }
  while (i < n) { out.push({ t: 'del', a: i + 1, text: a[i] }); i++ }
  while (j < m) { out.push({ t: 'add', b: j + 1, text: b[j] }); j++ }
  return out
}

// Collapse long unchanged runs, keeping `ctx` lines of context around each change.
function hunkify(rows: DiffRow[], ctx = 3): DiffRow[] {
  const keep = new Array(rows.length).fill(false)
  rows.forEach((r, i) => {
    if (r.t !== 'ctx') {
      for (let k = Math.max(0, i - ctx); k <= Math.min(rows.length - 1, i + ctx); k++) keep[k] = true
    }
  })
  const out: DiffRow[] = []
  let gap = false
  for (let i = 0; i < rows.length; i++) {
    if (keep[i]) { out.push(rows[i]); gap = false }
    else if (!gap) { out.push({ t: 'ctx', text: '⋯' }); gap = true }
  }
  return out
}

export default function PatchPreview({ finding }: { finding: PatchFinding }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult] = useState<{ compareUrl: string; branch: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState(false)

  async function runPreview() {
    setPhase('previewing'); setError(null); setUpgrade(false)
    try {
      const res = await fetch('/api/hub/operator/audit/patch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          mode: 'preview', file: finding.file, line: finding.line ?? undefined,
          title: finding.title, detail: finding.detail, recommendation: finding.recommendation,
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.status === 402 && data?.code === 'patch_not_in_plan') {
        setUpgrade(true); setError(data?.error || t('audit.patch.upgrade', 'AI patch generation is a Pro feature.')); setPhase('error'); return
      }
      if (!res.ok || !data?.ok) {
        setError(data?.error || t('audit.patch.previewFailed', 'Could not generate a preview.')); setPhase('error'); return
      }
      setPreview({
        path: data.path, title: data.title,
        oldContent: data.oldContent || '', newContent: data.newContent || '',
        before: data.before || '', after: data.after || '',
      })
      setPhase('preview')
    } catch {
      setError(t('audit.patch.previewFailed', 'Could not generate a preview.')); setPhase('error')
    }
  }

  async function confirmPush() {
    if (!preview) return
    setPhase('committing'); setError(null)
    try {
      const res = await fetch('/api/hub/operator/audit/patch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ mode: 'commit', file: preview.path, content: preview.newContent, title: preview.title }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setError(data?.error || t('audit.patch.pushFailed', 'Could not push the pull request.')); setPhase('error'); return
      }
      setResult({ compareUrl: data.compareUrl, branch: data.branch }); setPhase('done')
    } catch {
      setError(t('audit.patch.pushFailed', 'Could not push the pull request.')); setPhase('error')
    }
  }

  // ── Idle: the trigger ────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <button
        onClick={runPreview}
        className="w-full rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition-fast hover:brightness-110"
      >
        {t('audit.patch.generate', 'Generate fix')}
      </button>
    )
  }

  if (phase === 'previewing') {
    return <div className="rounded-md border border-border bg-bg px-3 py-2.5 text-[13px] text-text-muted">{t('audit.patch.generating', 'Generating fix preview…')}</div>
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="rounded-md border border-danger bg-bg px-3 py-3 text-[12.5px] leading-relaxed text-danger">
        {error}
        {upgrade ? (
          <a href="/dashboard/audit/pricing" className="mt-2 block w-fit rounded-md border border-accent bg-accent px-3 py-1.5 text-[12px] font-semibold text-bg">
            {t('audit.viewPlans', 'View plans')}
          </a>
        ) : (
          <button onClick={runPreview} className="mt-2 block rounded-md border border-border px-3 py-1.5 text-[12px] font-semibold text-text-muted hover:bg-surface">
            {t('audit.patch.retry', 'Try again')}
          </button>
        )}
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (phase === 'done' && result) {
    return (
      <div className="rounded-md border border-[#34d399]/40 bg-bg px-3.5 py-3">
        <div className="text-[13px] font-semibold text-[#86efac]">✓ {t('audit.patch.proposed', 'Fix proposed on a branch')}</div>
        <div className="mt-1 break-all font-mono text-[11px] text-text-muted">{result.branch}</div>
        <a href={result.compareUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[12.5px] font-semibold text-[#34d399]">
          {t('audit.patch.reviewMerge', 'Review & Merge')} ↗
        </a>
      </div>
    )
  }

  // ── Preview: impact panel + diff + confirm ───────────────────────────────────
  const rows = preview ? hunkify(diffLines(preview.oldContent, preview.newContent)) : []
  return (
    <div className="rounded-md border border-border bg-surface p-3.5">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {t('audit.patch.previewTitle', 'Proposed change — review before pushing')}
      </div>

      {/* Plain-English impact */}
      {(preview?.before || preview?.after) && (
        <div className="mb-3 grid gap-2">
          {preview?.before && (
            <div className="rounded-md border border-border bg-bg p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#fca5a5]">{t('audit.patch.before', 'Before')}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{preview.before}</p>
            </div>
          )}
          {preview?.after && (
            <div className="rounded-md border border-border bg-bg p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#86efac]">{t('audit.patch.after', 'After')}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{preview.after}</p>
            </div>
          )}
        </div>
      )}

      {/* Code diff */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[11px] text-text-muted">{preview?.path}</span>
        <span className="text-[10px] text-text-muted/70">
          <span className="text-[#86efac]">+{rows.filter(r => r.t === 'add').length}</span>{' '}
          <span className="text-[#fca5a5]">−{rows.filter(r => r.t === 'del').length}</span>
        </span>
      </div>
      <div className="overflow-auto rounded-md border border-border bg-bg font-mono text-[11.5px] leading-relaxed" style={{ maxHeight: 300 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            className={
              r.t === 'add' ? 'whitespace-pre bg-[rgba(52,211,153,0.10)] text-[#86efac]'
                : r.t === 'del' ? 'whitespace-pre bg-[rgba(239,68,68,0.10)] text-[#fca5a5]'
                  : 'whitespace-pre text-text-muted'
            }
          >
            <span className="inline-block w-7 select-none pr-2 text-right text-text-muted/50">
              {r.t === 'add' ? '+' : r.t === 'del' ? '−' : ''}
            </span>
            {r.text}
          </div>
        ))}
      </div>

      {/* Human handshake */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => { setPhase('idle'); setPreview(null) }}
          disabled={phase === 'committing'}
          className="rounded-md border border-border px-3.5 py-2.5 text-sm font-semibold text-text-muted transition-fast hover:bg-bg disabled:opacity-60"
        >
          {t('audit.patch.cancel', 'Cancel')}
        </button>
        <button
          onClick={confirmPush}
          disabled={phase === 'committing'}
          className="flex-1 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition-fast hover:brightness-110 disabled:opacity-70"
        >
          {phase === 'committing'
            ? t('audit.patch.pushing', 'Pushing…')
            : `🚀 ${t('audit.patch.confirmPush', 'Confirm & Push Pull Request')}`}
        </button>
      </div>
    </div>
  )
}
