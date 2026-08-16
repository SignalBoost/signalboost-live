'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { BUSINESS_INTELLIGENCE_CORPUS_COPY } from '@/lib/i18n/businessIntelligenceCorpusCopy'

const PROSPECT_SEED_LIMIT = 500

type CorpusStatus = {
  ok?: boolean
  target?: number
  count?: number
  remaining?: number
  completion?: number
  ready?: boolean
  error?: string
}

type SeedResult = {
  ok?: boolean
  scanned?: number
  candidates?: number
  uniqueCompanies?: number
  inserted?: number
  updated?: number
  failed?: number
  error?: string
}

type ProspectSeedCandidate = {
  canonicalDomain?: string
  companyName?: string
  confidence?: number
  evidenceRows?: number
  distinctCampaignJobs?: number
  sameDomainContactEvidence?: number
  descriptionEvidenceRows?: number
}

type ProspectSeedResult = {
  ok?: boolean
  source?: string
  mode?: 'dry_run' | 'apply'
  providerCalls?: number
  externalAiCalls?: number
  observations?: number
  validatedCandidates?: number
  alreadyPresent?: number
  newCandidates?: number
  selected?: number
  attempted?: number
  succeeded?: number
  failed?: number
  failures?: Array<{ canonicalDomain?: string; error?: string }>
  before?: number
  after?: number
  netAdded?: number
  candidates?: ProspectSeedCandidate[]
  error?: string
}

function prospectSnapshot(result: ProspectSeedResult | null): string {
  if (!result) return ''
  return JSON.stringify({
    before: result.before ?? null,
    newCandidates: result.newCandidates ?? null,
    selected: result.selected ?? null,
    candidates: (result.candidates || []).map(candidate => ({
      canonicalDomain: candidate.canonicalDomain || '',
      companyName: candidate.companyName || '',
      confidence: candidate.confidence ?? null,
      evidenceRows: candidate.evidenceRows ?? null,
      distinctCampaignJobs: candidate.distinctCampaignJobs ?? null,
      sameDomainContactEvidence: candidate.sameDomainContactEvidence ?? null,
      descriptionEvidenceRows: candidate.descriptionEvidenceRows ?? null,
    })),
  })
}

function reviewableDryRun(result: ProspectSeedResult | null): result is ProspectSeedResult {
  return Boolean(
    result &&
    result.mode === 'dry_run' &&
    result.ok !== false &&
    (result.failed ?? 0) === 0,
  )
}

export default function BusinessIntelligenceCorpusPage() {
  const { lang } = useI18n()
  const copy = BUSINESS_INTELLIGENCE_CORPUS_COPY[lang] || BUSINESS_INTELLIGENCE_CORPUS_COPY.en
  const [status, setStatus] = useState<CorpusStatus | null>(null)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [prospectResult, setProspectResult] = useState<ProspectSeedResult | null>(null)
  const [reviewedDryRun, setReviewedDryRun] = useState<ProspectSeedResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [prospectAction, setProspectAction] = useState<'dry_run' | 'apply' | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/business-intelligence-corpus/status', { cache: 'no-store' })
      setStatus(await response.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function seedHistory() {
    if (running) return
    setRunning(true)
    setResult(null)
    try {
      const response = await fetch('/api/admin/business-intelligence-corpus/seed-outreach-history', { method: 'POST' })
      const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      setResult(body)
      await refresh()
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : copy.importFailed })
    } finally {
      setRunning(false)
    }
  }

  async function requestProspectHistory(apply: boolean): Promise<ProspectSeedResult> {
    const response = await fetch('/api/admin/business-intelligence-corpus/seed-prospect-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apply, limit: PROSPECT_SEED_LIMIT }),
    })
    const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` })) as ProspectSeedResult
    if (!response.ok && !body.error) body.error = copy.importFailed
    return body
  }

  async function dryRunProspectHistory() {
    if (prospectAction) return
    setProspectAction('dry_run')
    setProspectResult(null)
    setReviewedDryRun(null)
    try {
      const body = await requestProspectHistory(false)
      setProspectResult(body)
      if (reviewableDryRun(body)) setReviewedDryRun(body)
    } catch (error) {
      setProspectResult({ ok: false, error: error instanceof Error ? error.message : copy.importFailed })
    } finally {
      setProspectAction(null)
    }
  }

  async function applyReviewedProspectHistory() {
    if (prospectAction) return
    if (!reviewedDryRun) {
      setProspectResult({ ok: false, error: copy.prospectDryRunRequired })
      return
    }

    setProspectAction('apply')
    try {
      // Re-run the non-mutating validation immediately before apply. If corpus state,
      // campaign evidence, ordering, or the exact reviewed candidate set changed,
      // fail closed and require another human review instead of applying a new set.
      const preflight = await requestProspectHistory(false)
      if (!reviewableDryRun(preflight) || prospectSnapshot(preflight) !== prospectSnapshot(reviewedDryRun)) {
        setReviewedDryRun(null)
        setProspectResult({ ...preflight, ok: false, error: copy.prospectSnapshotChanged })
        return
      }

      const body = await requestProspectHistory(true)
      setReviewedDryRun(null)
      setProspectResult(body)
      await refresh()
    } catch (error) {
      setReviewedDryRun(null)
      setProspectResult({ ok: false, error: error instanceof Error ? error.message : copy.importFailed })
    } finally {
      setProspectAction(null)
    }
  }

  const count = status?.count ?? 0
  const target = status?.target ?? 5000
  const completion = status?.completion ?? 0
  const completionPercent = Number((completion * 100).toFixed(2))
  const reviewedCount = reviewedDryRun?.selected ?? 0

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', color: '#fff' }}>
      <p style={{ color: '#ffc300', fontWeight: 800, letterSpacing: 1 }}>{copy.eyebrow}</p>
      <h1 style={{ fontSize: 34, margin: '8px 0' }}>{copy.title}</h1>
      <p style={{ opacity: .72, lineHeight: 1.6 }}>{copy.description}</p>

      <section style={{ marginTop: 28, padding: 24, border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, background: 'rgba(255,255,255,.03)' }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div><strong style={{ fontSize: 28 }}>{loading ? '…' : count}</strong><div style={{ opacity: .6 }}>{copy.companies}</div></div>
          <div><strong style={{ fontSize: 28 }}>{target}</strong><div style={{ opacity: .6 }}>{copy.target}</div></div>
          <div><strong style={{ fontSize: 28 }}>{completionPercent}%</strong><div style={{ opacity: .6 }}>{copy.complete}</div></div>
        </div>

        <button
          type="button"
          onClick={seedHistory}
          disabled={running}
          style={{ marginTop: 28, padding: '13px 20px', borderRadius: 10, border: 0, cursor: running ? 'wait' : 'pointer', fontWeight: 800 }}
        >
          {running ? copy.importing : copy.importHistory}
        </button>
        <p style={{ marginTop: 10, opacity: .6, fontSize: 13 }}>{copy.ownerOnly}</p>

        {result && (
          <pre style={{ marginTop: 20, padding: 16, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,.35)', borderRadius: 10 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {status?.error && <p style={{ color: '#ff7777' }}>{status.error}</p>}
      </section>

      <section style={{ marginTop: 24, padding: 24, border: '1px solid rgba(255,195,0,.28)', borderRadius: 16, background: 'rgba(255,195,0,.035)' }}>
        <h2 style={{ margin: 0, fontSize: 24 }}>{copy.prospectTitle}</h2>
        <p style={{ opacity: .72, lineHeight: 1.6 }}>{copy.prospectDescription}</p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
          <button
            type="button"
            onClick={dryRunProspectHistory}
            disabled={prospectAction !== null}
            style={{ padding: '13px 20px', borderRadius: 10, border: 0, cursor: prospectAction ? 'wait' : 'pointer', fontWeight: 800 }}
          >
            {prospectAction === 'dry_run' ? copy.prospectDryRunning : copy.prospectDryRun}
          </button>
          <button
            type="button"
            onClick={applyReviewedProspectHistory}
            disabled={prospectAction !== null || !reviewedDryRun || reviewedCount <= 0}
            style={{ padding: '13px 20px', borderRadius: 10, border: '1px solid rgba(255,195,0,.55)', cursor: prospectAction || !reviewedDryRun || reviewedCount <= 0 ? 'not-allowed' : 'pointer', fontWeight: 800, background: 'transparent', color: 'inherit' }}
          >
            {prospectAction === 'apply' ? copy.prospectApplying : copy.prospectApply}
          </button>
        </div>

        <p style={{ marginTop: 10, opacity: .6, fontSize: 13 }}>{copy.prospectOwnerOnly}</p>
        {reviewedDryRun && reviewedCount > 0 && <p style={{ marginTop: 10, color: '#ffc300', fontWeight: 700 }}>{copy.prospectReviewReady}</p>}

        {prospectResult && (
          <pre style={{ marginTop: 20, padding: 16, maxHeight: 520, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'rgba(0,0,0,.35)', borderRadius: 10 }}>
            {JSON.stringify(prospectResult, null, 2)}
          </pre>
        )}
      </section>
    </main>
  )
}
