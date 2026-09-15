// saas/app/dashboard/cos-university-approvals/page.tsx
'use client'

// Owner door for /api/admin/cos-university-runtime-approvals. Replaces hand-typed approval SQL:
// the server builds the exact evidence shape, refuses near a cron tick, and confirms by read-back.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { COS_UNIVERSITY_APPROVALS_COPY, type CosUniversityApprovalsLanguage } from '@/lib/i18n/cosUniversityApprovalsCopy'

type Status = {
  ok?: boolean
  error?: string
  authRequired?: boolean
  artifact?: {
    candidateId: string
    subjectId: string
    artifactHash: string
    holdoutCaseCount: number
    maxEndpointCalls: number
    maxJudgeCalls: number
    maxSoloRetryCalls: number
  } | null
  state?: 'none' | 'armed' | 'consumed' | 'expired' | 'evaluated'
  evaluation?: { observedAt: string; baselineScore: number | null; trainedArtifactScore: number | null; improved: boolean } | null
  approval?: { observedAt: string; expiresAt: string | null } | null
  outcome?: { observedAt: string; commit: string; succeeded: boolean; reason: string | null; error: string | null } | null
  clearance?: { ok: boolean; retryAfterSeconds: number; nextTickAt: string }
}

type IssueResult = { ok?: boolean; error?: string; retryAfterSeconds?: number; observedAt?: string; expiresAt?: string }

async function readJson(response: Response): Promise<any> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { error: `${response.status}: ${text.slice(0, 300)}` } }
}

function when(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

export default function CosUniversityApprovalsPage() {
  const { lang } = useTranslation()
  const copy = COS_UNIVERSITY_APPROVALS_COPY[(lang in COS_UNIVERSITY_APPROVALS_COPY ? lang : 'en') as CosUniversityApprovalsLanguage]
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/cos-university-runtime-approvals', { cache: 'no-store' })
    setStatus(await readJson(response))
  }, [])

  useEffect(() => { void load() }, [load])

  const authorize = async () => {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/cos-university-runtime-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'distilled_evaluation' }),
      })
      const result: IssueResult = await readJson(response)
      if (result.ok) setMessage(copy.issued)
      else if (result.error === 'artifact_already_independently_evaluated') setMessage(copy.alreadyEvaluated)
      else if (result.error === 'too_close_to_evaluator_tick') setMessage(copy.waitSeconds.replace('{s}', String(result.retryAfterSeconds ?? 60)))
      else setMessage(result.error || String(response.status))
      await load()
    } finally {
      setBusy(false)
    }
  }

  const stateLabel = status?.state === 'evaluated' ? copy.stateEvaluated
    : status?.state === 'armed' ? copy.stateArmed
    : status?.state === 'consumed' ? copy.stateConsumed
    : status?.state === 'expired' ? copy.stateExpired
    : copy.stateNone

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="text-sm opacity-80">{copy.subtitle}</p>
      </header>

      {status?.authRequired ? <p className="text-red-600">{copy.signInRequired}</p> : null}
      {status?.error && !status?.authRequired ? <p className="text-red-600 break-all">{status.error}</p> : null}

      {status && !status.artifact && status.ok ? <p>{copy.noArtifact}</p> : null}

      {status?.artifact ? (
        <section className="rounded-lg border p-4 space-y-2 text-sm">
          <div><strong>{copy.candidate}:</strong> <span className="break-all">{status.artifact.candidateId}</span></div>
          <div><strong>{copy.artifact}:</strong> <code>{status.artifact.artifactHash.slice(0, 16)}…</code></div>
          <div><strong>{copy.holdoutCases}:</strong> {status.artifact.holdoutCaseCount}</div>
          <div>
            <strong>{copy.callCeilings}:</strong>{' '}
            {status.artifact.maxEndpointCalls} / {status.artifact.maxJudgeCalls} / {status.artifact.maxSoloRetryCalls}
          </div>
          <div><strong>{copy.state}:</strong> {stateLabel}</div>
          {status.approval ? (
            <>
              <div><strong>{copy.armedAt}:</strong> {when(status.approval.observedAt)}</div>
              <div><strong>{copy.expiresAt}:</strong> {when(status.approval.expiresAt)}</div>
            </>
          ) : null}
          {status.evaluation ? (
            <div>
              {copy.evaluationScores
                .replace('{student}', status.evaluation.trainedArtifactScore === null ? '—' : status.evaluation.trainedArtifactScore.toFixed(3))
                .replace('{baseline}', status.evaluation.baselineScore === null ? '—' : status.evaluation.baselineScore.toFixed(3))}
              {' · '}{when(status.evaluation.observedAt)}
            </div>
          ) : null}
          <div><strong>{copy.nextTick}:</strong> {when(status.clearance?.nextTickAt)}</div>
          <div>
            <strong>{copy.lastOutcome}:</strong>{' '}
            {status.outcome
              ? `${status.outcome.succeeded ? copy.outcomeSucceeded : copy.outcomeFailed} · ${when(status.outcome.observedAt)}${status.outcome.error ? ` · ${status.outcome.error}` : ''}`
              : copy.noOutcome}
          </div>
        </section>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-40"
          disabled={busy || !status?.artifact || status?.state === 'armed' || status?.state === 'evaluated'}
          onClick={() => { void authorize() }}
        >
          {busy ? copy.authorizing : copy.authorize}
        </button>
        <button type="button" className="rounded-md border px-4 py-2" onClick={() => { void load() }}>{copy.refresh}</button>
      </div>

      {message ? <p className="text-sm">{message}</p> : null}
    </main>
  )
}
