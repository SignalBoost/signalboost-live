// saas/app/demo/supervisor/page.tsx
//
// THE PUBLIC DEMO VIEWER.
//
// A prospective buyer has no account and cannot reach the operator console, so without this
// page the demo exists only over a screen share. This page serves a record the owner has
// explicitly published, to anyone holding the share link.
//
// NO LOGIN, NO BUTTONS, NO ACTIONS. Everything here is read from a stored record. Nothing on
// this page can run a scenario, send a notification, or write anything — the two routes that
// can do those things are owner-only and live elsewhere.
//
// THE PAGE DOES NOT DISTINGUISH BETWEEN WRONG, EXPIRED AND REVOKED. All three produce the
// same neutral message. Telling an anonymous visitor which of those applies turns the page
// into an oracle for probing tokens.
//
// NOT INDEXED. A share link handed to one prospect should not turn up in a search result.
//
// The record was redacted at publish time — addresses, links and infrastructure identifiers
// are already gone before anything reaches this page. This page re-states that fact to the
// reader rather than relying on them to assume it.

import { cookies } from 'next/headers'
import { createHash } from 'node:crypto'
import { DEMO_SHARE_COPY, type DemoShareLanguage } from '@/lib/i18n/demoShareCopy'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

type Check = { id?: string; title?: string; passed?: boolean; detail?: string }
type Run = { category?: string; passed?: boolean; checks?: Check[]; auditEventTypes?: string[] }
type Payload = {
  passed?: boolean
  meaning?: string
  blocking?: string[]
  runs?: Run[]
  delivery?: { status?: string; incidentId?: string | null; outcome?: string | null; reason?: string | null }
  auditEventTypes?: string[]
}

type Record_ = {
  kind?: string
  title?: string
  published_at?: string
  expires_at?: string | null
  payload?: Payload
}

function pickLanguage(value?: string): DemoShareLanguage {
  const short = String(value || 'en').slice(0, 2).toLowerCase()
  return (['en', 'es', 'pt', 'pl', 'ru'] as DemoShareLanguage[]).includes(short as DemoShareLanguage)
    ? (short as DemoShareLanguage)
    : 'en'
}

async function loadRecord(token: string): Promise<Record_ | null> {
  if (!/^[0-9a-f]{32,128}$/.test(token)) return null
  const hash = createHash('sha256').update(token).digest('hex')
  try {
    const { data, error } = await getAdminSupabase()
      .from('supervisor_demo_records')
      .select('kind,title,published_at,expires_at,revoked_at,payload')
      .eq('share_token_hash', hash)
      .maybeSingle()
    if (error || !data) return null
    if (data.revoked_at) return null
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null
    return data as Record_
  } catch {
    return null
  }
}

export default async function PublicSupervisorDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string | string[] }>
}) {
  const params = await searchParams
  const raw = params?.k
  const token = String(Array.isArray(raw) ? raw[0] : raw || '').trim()
  const copy = DEMO_SHARE_COPY[pickLanguage((await cookies()).get('sb_locale')?.value)]
  const record = token ? await loadRecord(token) : null

  if (!record) {
    return (
      <main style={page}>
        <section style={panel}>
          <h1 style={{ marginTop: 0 }}>{copy.invalidTitle}</h1>
          <p style={muted}>{copy.invalidBody}</p>
        </section>
      </main>
    )
  }

  const isDrill = record.kind === 'drill'
  const payload = record.payload || {}
  const didPass = payload.passed === true

  return (
    <main style={page}>
      <section style={panel}>
        <div style={badgeRow}>
          <span style={badge}>{isDrill ? copy.drillBadge : copy.rehearsalBadge}</span>
        </div>
        <h1 style={{ margin: '10px 0 4px' }}>{copy.productName}</h1>
        <p style={muted}>{isDrill ? copy.drillIntro : copy.rehearsalIntro}</p>
        <p style={warn}>{copy.notProduction}</p>

        <p style={fine}>
          {copy.publishedLabel}: {record.published_at}
          {record.expires_at ? ` · ${copy.expiresLabel}: ${record.expires_at}` : ''}
        </p>

        {isDrill ? (
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>{copy.deliveryTitle}</h2>
            <dl style={grid}>
              <div>
                <dt style={muted}>{copy.deliveryLabel}</dt>
                <dd style={dd}>{payload.delivery?.status}</dd>
              </div>
              <div>
                <dt style={muted}>{copy.incidentLabel}</dt>
                <dd style={dd}>{payload.delivery?.incidentId}</dd>
              </div>
              <div>
                <dt style={muted}>{copy.outcomeLabel}</dt>
                <dd style={dd}>{payload.delivery?.outcome}</dd>
              </div>
            </dl>
            {payload.delivery?.reason ? <p style={muted}>{payload.delivery.reason}</p> : null}
            {payload.auditEventTypes?.length ? (
              <p style={muted}>
                {copy.auditEvents}: {payload.auditEventTypes.join(', ')}
              </p>
            ) : null}
            <p style={warn}>{copy.noExecution}</p>
          </section>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <section style={{ ...card, borderColor: didPass ? '#38f2a4' : '#ff5c7a' }}>
              <h2 style={{ marginTop: 0, color: didPass ? '#71ffc1' : '#ff8ca2' }}>
                {didPass ? copy.passed : copy.failed}
              </h2>
              {payload.meaning ? <p>{payload.meaning}</p> : null}
              {payload.blocking?.length ? (
                <ul style={muted}>
                  {payload.blocking.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            {(payload.runs || []).map((run, index) => (
              <section key={run.category || String(index)} style={card}>
                <h3 style={{ marginTop: 0 }}>{run.category}</h3>
                <h4 style={label}>{copy.checksTitle}</h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                  {(run.checks || []).map((check, checkIndex) => (
                    <li key={check.id || String(checkIndex)}>
                      <strong style={{ color: check.passed ? '#71ffc1' : '#ff8ca2' }}>
                        {check.passed ? copy.pass : copy.fail}
                      </strong>{' '}
                      {check.title}
                      <div style={muted}>{check.detail}</div>
                    </li>
                  ))}
                </ul>
                {run.auditEventTypes?.length ? (
                  <p style={muted}>
                    {copy.auditTitle}: {run.auditEventTypes.join(', ')}
                  </p>
                ) : null}
              </section>
            ))}

            <p style={muted}>{copy.auditNote}</p>
          </div>
        )}

        <section style={{ ...card, marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>{copy.contactTitle}</h2>
          <p style={muted}>{copy.contactBody}</p>
        </section>

        <p style={fine}>{copy.redactionNote}</p>
      </section>
    </main>
  )
}

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#07111f,#05070c)' }
const panel = { maxWidth: 880, margin: '0 auto', border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)' }
const card = { border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: 16, background: 'rgba(0,0,0,.24)', marginTop: 14 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }
const badgeRow = { display: 'flex', gap: 8, flexWrap: 'wrap' as const }
const badge = { border: '1px solid rgba(245,196,81,.6)', borderRadius: 999, padding: '6px 12px', color: '#f5c451', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' as const }
const label = { color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 800, letterSpacing: 0.4, margin: '12px 0 6px' }
const dd = { margin: 0, wordBreak: 'break-word' as const, fontWeight: 700 }
const muted = { color: 'rgba(255,255,255,.68)' }
const fine = { color: 'rgba(255,255,255,.45)', fontSize: 12 }
const warn = { color: '#ffd8a8', fontWeight: 700 }
