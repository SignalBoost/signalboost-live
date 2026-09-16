'use client'

// Owner door for /api/admin/cos-verified-outcomes: turns real results of COS answers into verified
// Production evidence for the University, with the subject taken from the owner's original request.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { COS_VERIFIED_OUTCOMES_COPY, type CosVerifiedOutcomesLanguage } from '@/lib/i18n/cosVerifiedOutcomesCopy'

type Turn = { turnId: string; answeredAt: string; requestExcerpt: string; replyExcerpt: string; subjects: string[]; verified: boolean }
type Draft = { outcome: 'success' | 'failure'; evidenceRef: string; summary: string }

async function readJson(response: Response): Promise<any> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { error: `${response.status}: ${text.slice(0, 300)}` } }
}

export default function CosVerifiedOutcomesPage() {
  const { lang } = useTranslation()
  const copy = COS_VERIFIED_OUTCOMES_COPY[(lang in COS_VERIFIED_OUTCOMES_COPY ? lang : 'en') as CosVerifiedOutcomesLanguage]
  const [turns, setTurns] = useState<Turn[] | null>(null)
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState('')
  const [messages, setMessages] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const result = await readJson(await fetch('/api/admin/cos-verified-outcomes', { cache: 'no-store' }))
    setAuthRequired(Boolean(result.authRequired))
    setError(result.ok ? '' : String(result.error || ''))
    setTurns(Array.isArray(result.turns) ? result.turns : [])
  }, [])

  useEffect(() => { void load() }, [load])

  const draftFor = (turnId: string): Draft => drafts[turnId] || { outcome: 'success', evidenceRef: '', summary: '' }
  const update = (turnId: string, change: Partial<Draft>) => setDrafts(current => ({ ...current, [turnId]: { ...draftFor(turnId), ...change } }))

  const submit = async (turnId: string) => {
    setBusy(turnId)
    try {
      const draft = draftFor(turnId)
      const result = await readJson(await fetch('/api/admin/cos-verified-outcomes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnId, ...draft }),
      }))
      setMessages(current => ({ ...current, [turnId]: result.ok ? copy.recorded : String(result.error || 'error') }))
      if (result.ok) await load()
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="text-sm opacity-80">{copy.subtitle}</p>
        <p className="text-sm opacity-80">{copy.rules}</p>
        <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => { void load() }}>{copy.refresh}</button>
      </header>

      {authRequired ? <p className="text-red-600">{copy.signInRequired}</p> : null}
      {error && !authRequired ? <p className="text-red-600 break-all">{error}</p> : null}
      {turns && !turns.length && !error ? <p>{copy.empty}</p> : null}

      {(turns || []).map(turn => {
        const draft = draftFor(turn.turnId)
        const canVerify = !turn.verified && turn.subjects.length > 0
        return (
          <section key={turn.turnId} className="rounded-lg border p-4 space-y-2 text-sm">
            <div className="opacity-70">{new Date(turn.answeredAt).toISOString().replace('T', ' ').slice(0, 16)} {copy.utc}</div>
            <div><strong>{copy.request}:</strong> {turn.requestExcerpt}</div>
            <div><strong>{copy.reply}:</strong> {turn.replyExcerpt}</div>
            <div><strong>{copy.subjects}:</strong> {turn.subjects.length ? turn.subjects.join(', ') : copy.noSubject}</div>
            {turn.verified ? <div className="font-medium">{copy.verified}</div> : null}
            {canVerify ? (
              <div className="space-y-2 pt-2">
                <label className="block">
                  <span className="font-medium">{copy.outcome}</span>
                  <select className="mt-1 block w-full rounded border p-2" value={draft.outcome}
                    onChange={event => update(turn.turnId, { outcome: event.target.value === 'failure' ? 'failure' : 'success' })}>
                    <option value="success">{copy.success}</option>
                    <option value="failure">{copy.failure}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="font-medium">{copy.evidence}</span>
                  <input className="mt-1 block w-full rounded border p-2" value={draft.evidenceRef} placeholder={copy.evidenceHint}
                    onChange={event => update(turn.turnId, { evidenceRef: event.target.value })} />
                </label>
                <label className="block">
                  <span className="font-medium">{copy.summary}</span>
                  <textarea className="mt-1 block w-full rounded border p-2" rows={2} value={draft.summary} placeholder={copy.summaryHint}
                    onChange={event => update(turn.turnId, { summary: event.target.value })} />
                </label>
                <button type="button" className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-40"
                  disabled={busy === turn.turnId || draft.evidenceRef.trim().length < 8 || draft.summary.trim().length < 20}
                  onClick={() => { void submit(turn.turnId) }}>
                  {busy === turn.turnId ? copy.submitting : copy.submit}
                </button>
              </div>
            ) : null}
            {messages[turn.turnId] ? <p>{messages[turn.turnId]}</p> : null}
          </section>
        )
      })}
    </main>
  )
}
