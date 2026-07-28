// saas/app/dashboard/supervisor/acceptance/page.tsx
//
// A BUTTON, because the acceptance run had no route a person could actually take.
//
// The scenario itself has existed for a while, and so have two ways to invoke it: a CLI
// (`scripts/run-self-healing-acceptance.mjs`) and an owner-only endpoint
// (POST /api/autonomous-supervisor/acceptance). Both assumed a terminal — one to run node,
// the other to issue a POST. This platform's owner works through a browser, so "just run the
// acceptance" was never actually available to him, and the last item on the portable's
// checklist stayed open for want of a click target rather than for want of code.
//
// Everything it needs is already configured: OWNER_EMAILS is what grants owner status in the
// first place (lib/auth/access.ts), and RESEND_API_KEY already sends the platform's press and
// social email. So this page adds no new configuration — it only makes the existing run
// reachable.
//
// It sends REAL email to the configured approvers. That is the test, not a side effect: the
// scenario is only counted as passing once the notification sink accepts delivery.
'use client'

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { LocalizedText } from '@/components/i18n/LocalizedText'
import { auditUiText } from '@/lib/i18n/auditUiCopy'
import { uiText } from '@/lib/i18n/uiText'

type Check = { id: string; title: string; passed: boolean; detail: string }
type Run = { category: string; passed: boolean; checks: Check[]; auditEventTypes: string[]; summary: string }
type Record = { ok?: boolean; passed?: boolean; ranAt?: string; productName?: string; runs?: Run[]; blocking?: string[]; meaning?: string; error?: string; remedy?: string; stage?: string }

const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 18, marginBottom: 16, background: 'rgba(255,255,255,.03)' }
const muted: React.CSSProperties = { color: '#9aa4b9', fontSize: 13, lineHeight: 1.5 }

export default function SupervisorAcceptancePage() {
  const { lang } = useTranslation()
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [record, setRecord] = useState<Record | null>(null)
  const [error, setError] = useState('')

  async function run() {
    if (state === 'running') return
    setState('running'); setError(''); setRecord(null)
    try {
      const response = await fetch('/api/autonomous-supervisor/acceptance', { method: 'POST' })
      const payload = await response.json() as Record
      setRecord(payload)
      // 409 is a real answer, not a transport failure: it means a check failed, or the host
      // context could not be built. Only a non-JSON or network error is an error here.
      if (!response.ok && !payload) setError(`${auditUiText(lang, "Request failed")} (${response.status})`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : auditUiText(lang, "The request did not complete"))
    } finally {
      setState('done')
    }
  }

  const passed = record?.passed === true

  return <main style={{ padding: 24, maxWidth: 900 }}>
    <h1 style={{ marginTop: 0 }}><LocalizedText fallback={uiText('generatedUi.u_614fa76f485d1698')} /></h1>
    <p style={muted}>
      <LocalizedText fallback={uiText('generatedUi.u_a676647de4bd99e8')} />
    </p>

    <section style={panel}>
      <button
        type="button"
        onClick={run}
        disabled={state === 'running'}
        style={{ border: 0, borderRadius: 12, padding: '14px 20px', fontWeight: 900, fontSize: 15, cursor: state === 'running' ? 'wait' : 'pointer', color: '#07111f', background: '#f5c451' }}
      >
        {state === 'running' ? <LocalizedText fallback={uiText('generatedUi.u_5dd3a0fdd5b2f4f8')} /> : <LocalizedText fallback={uiText('generatedUi.u_96385fbce0625bd2')} />}
      </button>
      {state === 'running' ? <p style={muted}><LocalizedText fallback={uiText('generatedUi.u_6751d7b7241dfe6b')} /></p> : null}
      {error ? <p role="alert" style={{ color: '#ffb3c1', fontWeight: 700 }}>{error}</p> : null}
    </section>

    {record?.error ? <section style={{ ...panel, borderColor: '#ffb020' }}>
      <h2 style={{ marginTop: 0, color: '#ffcf7a' }}><LocalizedText fallback={uiText('generatedUi.u_25f0c23a0878a1de')} /></h2>
      <p>{record.error}</p>
      {record.remedy ? <p style={muted}>{record.remedy}</p> : null}
    </section> : null}

    {record?.runs?.length ? <>
      <section style={{ ...panel, borderColor: passed ? '#38f2a4' : '#ff5c7a' }}>
        <h2 style={{ marginTop: 0, color: passed ? '#71ffc1' : '#ff8ca2' }}>{passed ? <LocalizedText fallback={uiText('generatedUi.u_e5a0eb01db902f45')} /> : <LocalizedText fallback={uiText('generatedUi.u_02bd349299173f7f')} />}</h2>
        <p>{record.meaning}</p>
        {record.blocking?.length ? <ul>{record.blocking.map(item => <li key={item}>{item}</li>)}</ul> : null}
        <p style={muted}>{record.productName} · {record.ranAt}</p>
      </section>

      {record.runs.map(item => <section key={item.category} style={panel}>
        <h3 style={{ marginTop: 0 }}>{item.category}</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {item.checks.map(check => <li key={check.id}>
            <strong style={{ color: check.passed ? '#71ffc1' : '#ff8ca2' }}>{check.passed ? <LocalizedText fallback={uiText('generatedUi.u_2f9acb02faa121bb')} /> : <LocalizedText fallback={uiText('generatedUi.u_425305e25df9df10')} />}</strong>{' '}
            {check.title}
            <div style={muted}>{check.detail}</div>
          </li>)}
        </ul>
      </section>)}

      <section style={panel}>
        <h3 style={{ marginTop: 0 }}><LocalizedText fallback={uiText('generatedUi.u_f61ce1c0afd442be')} /></h3>
        <p style={muted}><LocalizedText fallback={uiText('generatedUi.u_7b1e5159e13129ea')} /></p>
        <textarea readOnly value={JSON.stringify(record, null, 2)} style={{ width: '100%', minHeight: 220, background: '#07111f', color: '#c3ccdf', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, padding: 12, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
      </section>
    </> : null}
  </main>
}
