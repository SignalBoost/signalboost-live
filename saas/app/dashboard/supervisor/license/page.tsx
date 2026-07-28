// saas/app/dashboard/supervisor/license/page.tsx
//
// LICENCE SETUP, IN THE BROWSER.
//
// The seller-side CLI (scripts/issue-license.ts) assumes a terminal. This page is the same
// operation for an operator who works in a browser: name the licensee, pick an edition,
// press once, and copy the three values into the deployment.
//
// THIS IS OPERATOR SETUP, NOT PART OF THE BUYER DEMO. It lives on its own route rather than
// on /dashboard/supervisor/demo deliberately — a prospect watching a demonstration should
// never be shown the screen that mints credentials.
//
// THE PRIVATE KEY IS DISPLAYED ONCE AND NEVER STORED. The page says so where it is shown,
// not in a footnote, because a key nobody realised was unrecoverable is a key that gets
// lost.

'use client'

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { LICENSE_SETUP_COPY, type LicenseSetupCopy } from '@/lib/i18n/licenseSetupCopy'
import {
  LICENSE_EDITIONS,
  type LicenseEdition,
  type LicenseMintFeatureId,
  type LicenseMintResult,
} from '@/lib/supervisor/licenseMintContract'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'

function pick(value?: string): Language {
  const short = String(value || 'en').slice(0, 2).toLowerCase()
  return (['en', 'es', 'pt', 'pl', 'ru'] as Language[]).includes(short as Language) ? (short as Language) : 'en'
}

function editionLabel(copy: LicenseSetupCopy, value?: string) {
  return value && LICENSE_EDITIONS.includes(value as LicenseEdition)
    ? copy.editions[value as LicenseEdition]
    : copy.notAvailable
}

function featureLabel(copy: LicenseSetupCopy, value: string) {
  return value in copy.featureLabels
    ? copy.featureLabels[value as LicenseMintFeatureId]
    : copy.notAvailable
}

export default function SupervisorLicensePage() {
  const { lang } = useTranslation()
  const copy = LICENSE_SETUP_COPY[pick(lang as string)]

  const [licensee, setLicensee] = useState('')
  const [edition, setEdition] = useState<LicenseEdition>('enterprise')
  const [days, setDays] = useState('365')
  const [state, setState] = useState<'idle' | 'running'>('idle')
  const [result, setResult] = useState<LicenseMintResult | null>(null)
  const [error, setError] = useState('')

  async function mint() {
    if (state === 'running') return
    if (!licensee.trim()) {
      setError(copy.needLicensee)
      return
    }
    setState('running')
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/supervisor/license/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licensee: licensee.trim(), edition, days: Number(days) || 365 }),
      })
      const payload = (await response.json()) as LicenseMintResult
      if (!response.ok && !payload.errorCode) {
        setError(copy.failed)
        return
      }
      setResult(payload)
    } catch {
      setError(copy.failed)
    } finally {
      setState('idle')
    }
  }

  const env = result?.environment
  const resultError = result?.errorCode ? copy.errors[result.errorCode] : ''
  const resultRemedy = result?.remedyCode ? copy.remedies[result.remedyCode] : ''

  return (
    <main style={page}>
      <section style={panel}>
        <h1 style={{ marginTop: 0 }}>{copy.title}</h1>
        <p style={muted}>{copy.intro}</p>

        <div style={grid}>
          <label style={field}>
            <span style={label}>{copy.licensee}</span>
            <input value={licensee} onChange={e => setLicensee(e.target.value)} placeholder={copy.licenseePlaceholder} style={input} />
          </label>
          <label style={field}>
            <span style={label}>{copy.edition}</span>
            <select value={edition} onChange={e => setEdition(e.target.value as LicenseEdition)} style={input}>
              {LICENSE_EDITIONS.map(name => (
                <option key={name} value={name} style={{ color: '#000' }}>{copy.editions[name]}</option>
              ))}
            </select>
          </label>
          <label style={field}>
            <span style={label}>{copy.days}</span>
            <input value={days} onChange={e => setDays(e.target.value)} inputMode="numeric" style={input} />
          </label>
        </div>

        <button type="button" onClick={mint} disabled={state === 'running'} style={{ ...button, cursor: state === 'running' ? 'wait' : 'pointer' }}>
          {state === 'running' ? copy.minting : copy.mint}
        </button>
        {error ? <p role="alert" style={alert}>{error}</p> : null}
        {resultError ? <p role="alert" style={alert}>{resultError}{resultRemedy ? ` — ${resultRemedy}` : ''}</p> : null}

        {env ? (
          <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
            <h2 style={{ margin: 0 }}>{copy.resultTitle}</h2>

            <section style={card}>
              <h3 style={{ marginTop: 0 }}>{copy.envTitle}</h3>
              <p style={muted}>{copy.envNote}</p>
              {Object.entries(env).map(([key, value]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={label}>{key}</div>
                  <textarea readOnly value={value} style={mono} />
                </div>
              ))}
            </section>

            <section style={{ ...card, borderColor: 'rgba(255,176,32,.55)' }}>
              <h3 style={{ marginTop: 0, color: '#ffcf7a' }}>{copy.privateTitle}</h3>
              <p style={warn}>{copy.privateNote}</p>
              <textarea readOnly value={result?.privateKeyPem || ''} style={mono} />
            </section>

            <section style={card}>
              <h3 style={{ marginTop: 0 }}>{copy.detailsTitle}</h3>
              <dl style={grid}>
                <div>
                  <dt style={muted}>{copy.licenseId}</dt>
                  <dd style={dd}>{result?.licence?.licenseId || copy.notAvailable}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.edition}</dt>
                  <dd style={dd}>{editionLabel(copy, result?.licence?.edition)}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.expires}</dt>
                  <dd style={dd}>{result?.licence?.expiresAt || copy.notAvailable}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.features}</dt>
                  <dd style={dd}>{(result?.licence?.features || []).map(item => featureLabel(copy, item)).join(', ') || copy.notAvailable}</dd>
                </div>
              </dl>
              {result?.warningCodes?.length ? (
                <ul style={muted}>
                  {result.warningCodes.map(code => (
                    <li key={code}>{copy.warnings[code]}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section style={card}>
              <h3 style={{ marginTop: 0 }}>{copy.nextTitle}</h3>
              <p style={muted}>{copy.nextBody}</p>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  )
}

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#07111f,#05070c)' }
const panel = { maxWidth: 900, margin: '0 auto', border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)' }
const card = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 16, background: 'rgba(0,0,0,.24)' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }
const field = { display: 'grid', gap: 6 }
const label = { color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }
const input = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 13, boxSizing: 'border-box' as const }
const mono = { width: '100%', minHeight: 90, padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: '#07111f', color: '#c3ccdf', fontFamily: 'ui-monospace, monospace', fontSize: 12, boxSizing: 'border-box' as const }
const button = { border: 0, borderRadius: 12, padding: '14px 20px', marginTop: 16, fontWeight: 900, fontSize: 15, color: '#07111f', background: '#f5c451' }
const dd = { margin: 0, wordBreak: 'break-word' as const, fontWeight: 700 }
const muted = { color: 'rgba(255,255,255,.68)' }
const warn = { color: '#ffd8a8', fontWeight: 700 }
const alert = { color: '#ffb3c1', fontWeight: 700 }
