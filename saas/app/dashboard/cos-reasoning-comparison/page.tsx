'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Role = 'primary' | 'coder' | 'critic' | 'verifier' | 'researcher'

type ComparisonCase = {
  id: string
  track: string
  suggestedRole: Role
  createdAt?: string
}

type ComparisonRun = {
  id: string
  case_id: string
  candidate_roles: Role[]
  started_at: string
  completed_at?: string | null
  attempted: number
  verified: number
  passed: number
  status: string
  error?: string | null
}

type ComparisonResult = {
  run_id: string
  case_id: string
  track: string
  candidate_id: string
  worker_role: Role
  reasoner_label?: string | null
  passed: boolean
  reasons?: string[]
  turn_id?: string | null
  latency_ms: number
  verified_outcome_recorded: boolean
  created_at: string
}

type ComparisonState = {
  ok: boolean
  currentReasoner: string | null
  roles: Role[]
  limits: {
    candidatesPerRun: number
    casesPerRun: number
    evaluationsPerRun: number
  }
  cases: ComparisonCase[]
  runs: ComparisonRun[]
  results: ComparisonResult[]
  note?: string
  error?: string
}

const EMPTY: ComparisonState = {
  ok: false,
  currentReasoner: null,
  roles: [],
  limits: { candidatesPerRun: 2, casesPerRun: 1, evaluationsPerRun: 2 },
  cases: [],
  runs: [],
  results: [],
}

function defaultCase(cases: ComparisonCase[]): ComparisonCase | undefined {
  return cases.find(item => item.track === 'incident-reasoning') ?? cases[0]
}

function alternateRole(suggested: Role, roles: Role[]): Role {
  if (suggested !== 'primary' && roles.includes('primary')) return 'primary'
  return roles.find(role => role !== suggested) ?? 'primary'
}

function shortModel(label: string | null | undefined): string {
  if (!label) return 'Unknown'
  return label.replace(/^managed-open-model:/, '')
}

export default function CosReasoningComparisonPage() {
  const [state, setState] = useState<ComparisonState>(EMPTY)
  const [caseId, setCaseId] = useState('')
  const [roleA, setRoleA] = useState<Role>('primary')
  const [roleB, setRoleB] = useState<Role>('critic')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null)

  const load = async () => {
    const response = await fetch('/api/admin/cos-reasoning-comparison', {
      credentials: 'include',
      cache: 'no-store',
    })
    const body = await response.json() as ComparisonState
    if (!response.ok) throw new Error(body.error || 'Could not load COS reasoning comparison.')
    setState(body)

    if (!caseId && body.cases.length) {
      const selected = defaultCase(body.cases)!
      setCaseId(selected.id)
      const suggested = selected.suggestedRole
      setRoleA(alternateRole(suggested, body.roles))
      setRoleB(suggested)
    }
  }

  useEffect(() => {
    void load().catch(err => setError(err instanceof Error ? err.message : String(err)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedCase = useMemo(
    () => state.cases.find(item => item.id === caseId),
    [caseId, state.cases],
  )

  const changeCase = (nextCaseId: string) => {
    setCaseId(nextCaseId)
    const selected = state.cases.find(item => item.id === nextCaseId)
    if (!selected) return
    setRoleA(alternateRole(selected.suggestedRole, state.roles))
    setRoleB(selected.suggestedRole)
  }

  const runComparison = async () => {
    if (!caseId || roleA === roleB) return
    setBusy(true)
    setError('')
    setLastRun(null)
    try {
      const response = await fetch('/api/admin/cos-reasoning-comparison', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId, roles: [roleA, roleB] }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Reasoning comparison failed.')
      setLastRun(body)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">COS Reasoning Comparison</h1>
            <p className="mt-1 text-sm text-text-muted">
              Owner-only held-out A/B evaluation of two COS reasoning workers on the same case.
            </p>
          </div>
          <Link className="rounded-md border border-border px-3 py-2 text-sm" href="/dashboard/cos-capability-benchmark">
            Back to Capability Benchmark
          </Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Card label="Current reasoner" value={shortModel(state.currentReasoner)} />
        <Card label="Max evaluations per run" value={String(state.limits.evaluationsPerRun)} />
        <Card label="Verified comparison results" value={String(state.results.filter(item => item.verified_outcome_recorded).length)} />
      </section>

      <section className="rounded-md border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Run a controlled comparison</h2>
            <p className="mt-1 max-w-3xl text-sm text-text-muted">
              This intentionally makes two billable model evaluations. Normal COS traffic is not duplicated and no comparison runs automatically.
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-text-muted">
            {state.currentReasoner ? shortModel(state.currentReasoner) : 'Loading reasoner…'}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Held-out case</span>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
              value={caseId}
              onChange={event => changeCase(event.target.value)}
              disabled={busy || state.cases.length === 0}
            >
              {state.cases.map(item => (
                <option key={item.id} value={item.id}>{item.track} — suggested {item.suggestedRole}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Worker A</span>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
              value={roleA}
              onChange={event => setRoleA(event.target.value as Role)}
              disabled={busy}
            >
              {state.roles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Worker B</span>
            <select
              className="w-full rounded-md border border-border bg-bg px-3 py-2"
              value={roleB}
              onChange={event => setRoleB(event.target.value as Role)}
              disabled={busy}
            >
              {state.roles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-md border border-border bg-bg/40 p-3 text-sm">
          <strong>Selected test:</strong>{' '}
          {selectedCase ? `${selectedCase.track}: ${roleA} vs ${roleB}` : 'Loading held-out cases…'}
          {selectedCase && <span className="ml-2 text-text-muted">Suggested specialist: {selectedCase.suggestedRole}</span>}
        </div>

        {roleA === roleB && (
          <p className="mt-3 text-sm text-danger">Choose two different workers.</p>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-danger/40 p-3 text-sm text-danger">{error}</p>
        )}
        {lastRun && (
          <p className="mt-3 rounded-md border border-success/40 p-3 text-sm">
            Comparison completed and durable results were recorded. The tables below have been refreshed.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
            disabled={busy || !caseId || roleA === roleB || state.roles.length < 2}
            onClick={() => void runComparison()}
          >
            {busy ? 'Running 2-worker comparison…' : 'Run Comparison'}
          </button>
          <button
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => void load().catch(err => setError(err instanceof Error ? err.message : String(err)))}
          >
            Refresh Results
          </button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="font-semibold">Recent candidate results</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs text-text-muted">
              <tr className="border-b border-border">
                <th className="px-2 py-2">Case</th>
                <th className="px-2 py-2">Worker</th>
                <th className="px-2 py-2">Result</th>
                <th className="px-2 py-2">Verified</th>
                <th className="px-2 py-2">Latency</th>
                <th className="px-2 py-2">Reasoner</th>
              </tr>
            </thead>
            <tbody>
              {state.results.slice(0, 20).map((item, index) => (
                <tr className="border-b border-border/60" key={`${item.run_id}-${item.candidate_id}-${index}`}>
                  <td className="px-2 py-2">{item.track}</td>
                  <td className="px-2 py-2 font-medium">{item.worker_role}</td>
                  <td className="px-2 py-2">{item.passed ? 'PASS' : 'FAIL'}</td>
                  <td className="px-2 py-2">{item.verified_outcome_recorded ? 'yes' : 'no'}</td>
                  <td className="px-2 py-2">{Math.round(Number(item.latency_ms) || 0).toLocaleString()} ms</td>
                  <td className="px-2 py-2 text-xs text-text-muted">{shortModel(item.reasoner_label)}</td>
                </tr>
              ))}
              {state.results.length === 0 && (
                <tr><td className="px-2 py-4 text-text-muted" colSpan={6}>No controlled comparisons have been run yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="font-semibold">Recent runs</h2>
        <div className="mt-3 space-y-2 text-sm">
          {state.runs.slice(0, 10).map(run => (
            <div className="rounded-md border border-border p-3" key={run.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{Array.isArray(run.candidate_roles) ? run.candidate_roles.join(' vs ') : 'comparison'}</span>
                <span className="text-xs text-text-muted">{run.status}</span>
              </div>
              <div className="mt-1 text-xs text-text-muted">
                attempted {run.attempted} · verified {run.verified} · passed {run.passed}
              </div>
              {run.error && <div className="mt-2 text-xs text-danger">{run.error}</div>}
            </div>
          ))}
          {state.runs.length === 0 && <p className="text-text-muted">No comparison runs yet.</p>}
        </div>
      </section>
    </main>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 break-words text-lg font-semibold">{value}</div>
    </div>
  )
}
