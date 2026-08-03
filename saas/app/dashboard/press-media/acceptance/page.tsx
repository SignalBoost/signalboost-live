// saas/app/dashboard/press-media/acceptance/page.tsx
//
// A BUTTON, for the same reason the Supervisor got one.
//
// The press acceptance scenario has existed since July and had two ways in: a CLI script and an
// owner-only POST. Both assume a terminal. This platform's owner works through a browser, so the
// last item on the portable's checklist stayed open for want of a click target — not for want of
// code. The portable sat at -rc because nobody could produce the evidence.
//
// IT SENDS ONE REAL EMAIL to the configured owner address. That is the test, not a side effect:
// the dispatch check only counts as passed once the mail transport confirms delivery. It never
// contacts a publication and never reads a target from a media database.
//
// A 409 IS A REAL ANSWER, not a transport failure — it means a check failed, or the host could
// not be built. The page renders it as a result rather than an error, because "the run happened
// and something is wrong" is exactly the information the operator came for.
//
// COPY GOES THROUGH auditUiText(lang, …) rather than new generatedUi keys, so this page adds no
// locale-file churn and still passes the i18n guards.
'use client'

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { auditUiText } from '@/lib/i18n/auditUiCopy'

type Check = { id: string; passed: boolean; detail: string }
type Record = {
  ok?: boolean
  passed?: boolean
  ranAt?: string
  providerId?: string
  checks?: Check[]
  blocking?: string[]
  meaning?: string
  summary?: string
  sentTo?: string
  creativeLength?: number
  placeholdersFound?: string[]
  error?: string
  remedy?: string
  stage?: string
}

const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 18, marginBottom: 16, background: 'rgba(255,255,255,.03)' }
const muted: React.CSSProperties = { color: '#9aa4b9', fontSize: 13, lineHeight: 1.5 }

export default function PressMediaAcceptancePage() {
  const { lang } = useTranslation()
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [record, setRecord] = useState<Record | null>(null)
  const [error, setError] = useState('')

  async function run() {
    if (state === 'running') return
    setState('running')
    setError('')
    setRecord(null)
    try {
      const response = await fetch('/api/agency/press-media/acceptance', { method: 'POST' })
      const payload = (await response.json()) as Record
      setRecord(payload)
      if (!response.ok && !payload) setError(`${auditUiText(lang, 'Request failed')} (${response.status})`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : auditUiText(lang, 'The request did not complete'))
    } finally {
      setState('done')
    }
  }

  const passed = record?.passed === true

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>{auditUiText(lang, 'Press & Media acceptance')}</h1>
      <p style={muted}>
        {auditUiText(lang, 'Runs the eleven acceptance checks against this deployment. One real email is sent to the owner address — never to a publication.')}
      </p>

      <section style={panel}>
        <button
          type="button"
          onClick={run}
          disabled={state === 'running'}
          style={{ border: 0, borderRadius: 12, padding: '14px 20px', fontWeight: 900, fontSize: 15, cursor: state === 'running' ? 'wait' : 'pointer', color: '#07111f', background: '#f5c451' }}
        >
          {state === 'running' ? auditUiText(lang, 'Running…') : auditUiText(lang, 'Run acceptance')}
        </button>
        {state === 'running' ? <p style={muted}>{auditUiText(lang, 'This sends a real message. Expect it in the owner inbox.')}</p> : null}
        {error ? <p role="alert" style={{ color: '#ffb3c1', fontWeight: 700 }}>{error}</p> : null}
      </section>

      {record?.error ? (
        <section style={{ ...panel, borderColor: '#ffb020' }}>
          <h2 style={{ marginTop: 0, color: '#ffcf7a' }}>{auditUiText(lang, 'The run could not start')}</h2>
          <p>{record.error}</p>
          {record.remedy ? <p style={muted}>{record.remedy}</p> : null}
        </section>
      ) : null}

      {record?.checks?.length ? (
        <>
          <section style={{ ...panel, borderColor: passed ? '#38f2a4' : '#ff5c7a' }}>
            <h2 style={{ marginTop: 0, color: passed ? '#71ffc1' : '#ff8ca2' }}>
              {passed ? auditUiText(lang, 'Passed') : auditUiText(lang, 'Not passed')}
            </h2>
            <p>{record.meaning}</p>
            {record.blocking?.length ? <ul>{record.blocking.map(item => <li key={item}>{item}</li>)}</ul> : null}
            <p style={muted}>
              {record.providerId} · {record.ranAt}
              {record.sentTo ? ` · ${auditUiText(lang, 'sent to')} ${record.sentTo}` : ''}
            </p>
          </section>

          <section style={panel}>
            <h3 style={{ marginTop: 0 }}>{auditUiText(lang, 'Checks')}</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {record.checks.map(check => (
                <li key={check.id}>
                  <strong style={{ color: check.passed ? '#71ffc1' : '#ff8ca2' }}>
                    {check.passed ? auditUiText(lang, 'PASS') : auditUiText(lang, 'FAIL')}
                  </strong>{' '}
                  {check.id}
                  <div style={muted}>{check.detail}</div>
                </li>
              ))}
            </ul>
          </section>

          <section style={panel}>
            <h3 style={{ marginTop: 0 }}>{auditUiText(lang, 'Evidence record')}</h3>
            <p style={muted}>{auditUiText(lang, 'Keep this. It is the acceptance evidence that closes the release.')}</p>
            <textarea
              readOnly
              value={JSON.stringify(record, null, 2)}
              style={{ width: '100%', minHeight: 220, background: '#07111f', color: '#c3ccdf', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, padding: 12, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            />
          </section>
        </>
      ) : null}
    </main>
  )
}
