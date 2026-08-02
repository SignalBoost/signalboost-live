// saas/app/dashboard/ads/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { uiText } from '@/lib/i18n/uiText'
import { toMinorUnits, formatMinor } from '@/lib/ads/ads-money'

// THE COCKPIT FOR THE ONLY SURFACE THAT SPENDS MONEY.
//
// Everything here goes through /api/ads, which is admin-gated and reads its access tokens
// from the environment rather than from the request. This page cannot spend anything the
// route would refuse.
//
// TWO THINGS IT REFUSES TO BLUR, both shown in colour rather than buried in copy:
//   1. DECLARED is not READY. A network with no access token set is listed with the exact
//      environment variable it wants, and cannot be selected. A buyer discovering at spend
//      time that a listed network was never configured is the failure this product is sold
//      against.
//   2. A CAP IS NOT A SPEND. The cap is what was authorised; the spend figure beside it is
//      what the provider reported. When the second passes the first the row says so — an
//      overdelivered campaign is a real state, not something to average away.
//
// Money is typed in MAJOR units because that is how people think about budgets, and
// converted to integer minor units before it leaves the browser. The conversion is the same
// one the declarations use, so it knows a yen has no minor unit and a dinar has three.

type SetupVar = { key: string; label: string; required: boolean; secret: boolean; hint: string | null; present: boolean }
type NetworkSetup = { id: string; label: string; prerequisite: string; vars: SetupVar[] }
type Platform = {
  id: string
  label: string
  currencies: string[]
  tokenVariable: string
  ready: boolean
  setup: NetworkSetup | null
  missing: string[]
  arrangements: Arrangement[]
  canConnect: boolean
  connection: Connection | null
}

type Connection = {
  platformId: string
  accountRef: string | null
  expiresAt: string | null
  connectedBy: string | null
  connectedAt: string | null
  lastError: string | null
}
type Unavailable = { id: string; reason: string }
type Ceiling = { platformId: string; accountRef: string; ceilingMinor: number; currency: string; display: string; setBy: string }
type Campaign = {
  id: string
  platformId: string
  accountRef: string
  campaignRef: string | null
  name: string
  status: string
  currency: string
  capMinor: number
  capDisplay: string
  spentMinor: number
  spentDisplay: string
  remainingMinor: number
  overCap: boolean
  spendApprovedBy: string
  contentApprovedBy: string
  lastReconciledAt: string | null
  reconcileError: string | null
}
type Arrangement = { id: string; label: string; description: string; eligibility: string; watches: string[] }
type DiscoveredAccount = { accountRef: string; name: string; currency: string | null; timezone: string | null; status: string | null; billingMode: string | null; label: string }
type Health = {
  platformId: string; accountRef: string; billingMode: string; currency: string | null
  invoiceDueAt: string | null; cardLast4: string | null; cardExpiresOn: string | null
  balanceMinor: number | null; creditLimitMinor: number | null; creditUsedMinor: number | null
  paymentState: string; billingSource: string
}
type AttentionItem = { id: string; severity: 'critical' | 'warning' | 'info'; kind: string; subject: string; message: string }
type Snapshot = {
  platforms: Platform[]; unavailable: Unavailable[]; ceilings: Ceiling[]; campaigns: Campaign[]
  health: Health[]; attention: AttentionItem[]
}

const panel: React.CSSProperties = { background: 'rgba(15,23,42,.86)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 18, padding: 18 }
const button: React.CSSProperties = { border: 'none', background: '#ffc300', color: '#020617', borderRadius: 12, padding: '9px 12px', fontWeight: 900, cursor: 'pointer' }
const ghost: React.CSSProperties = { border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '9px 12px', fontWeight: 800, cursor: 'pointer' }
const input: React.CSSProperties = { width: '100%', background: 'rgba(2,6,23,.6)', border: '1px solid rgba(148,163,184,.25)', borderRadius: 10, padding: '8px 10px', color: '#fff', fontSize: 13 }
const label: React.CSSProperties = { color: 'rgba(255,255,255,.62)', fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 4 }
const cell: React.CSSProperties = { padding: '8px 10px', fontSize: 12, color: 'rgba(255,255,255,.82)', borderBottom: '1px solid rgba(148,163,184,.12)' }

// ISO codes are the API's own machine vocabulary. They are NOT translated: translating the
// value would break the currency the form posts back.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'MXN', 'BRL', 'JPY', 'PLN']

function chip(text: string, color = '#94a3b8') {
  return <span style={{ display: 'inline-flex', border: `1px solid ${color}66`, background: `${color}18`, color, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 900 }}>{text}</span>
}

export default function AdsCockpit() {
  const [data, setData] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/ads', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setProblem(String(json?.error || res.status)); setData(null) }
      else { setProblem(''); setData(json as Snapshot) }
    } catch (error: any) {
      setProblem(String(error?.message || error))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // The OAuth callback sends the operator back here with its result in the query string.
  // Read once and cleared from the URL, so a refresh does not replay an old outcome.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const failed = params.get('connect_failed')
    if (connected) setMessage(`${uiText('generatedUi.u_ads_connectok')} — ${connected}`)
    if (failed) setProblem(failed)
    if (connected || failed) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function post(body: Record<string, unknown>) {
    setMessage(''); setProblem('')
    const res = await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setProblem(String(json?.error || res.status)); return false }
    setMessage(String(json?.note || json?.status || 'ok'))
    await load()
    return true
  }

  const readyPlatforms = useMemo(() => (data?.platforms || []).filter(p => p.ready), [data])

  return (
    <main style={{ padding: '28px 20px 60px', maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
      <header>
        <h1 style={{ color: '#fff', margin: 0, fontSize: 26 }}>{uiText('generatedUi.u_ads_title')}</h1>
        <p style={{ color: 'rgba(255,255,255,.6)', margin: '8px 0 0', fontSize: 13, maxWidth: 780 }}>{uiText('generatedUi.u_ads_intro')}</p>
      </header>

      {problem ? <div style={{ ...panel, borderColor: '#f8717155', color: '#fca5a5', fontSize: 13 }}>{problem}</div> : null}
      {message ? <div style={{ ...panel, borderColor: '#22c55e55', color: '#86efac', fontSize: 13 }}>{message}</div> : null}
      {loading ? <div style={{ ...panel, color: 'rgba(255,255,255,.6)', fontSize: 13 }}>{uiText('generatedUi.u_ads_loading')}</div> : null}

      <section style={panel}>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{uiText('generatedUi.u_ads_networks')}</h2>
        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '6px 0 14px' }}>{uiText('generatedUi.u_ads_networksnote')}</p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {(data?.platforms || []).map(platform => (
            <div key={platform.id} style={{ border: '1px solid rgba(148,163,184,.2)', borderRadius: 14, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong style={{ color: '#fff', fontSize: 14 }}>{platform.label}</strong>
                {platform.ready ? chip(uiText('generatedUi.u_ads_ready'), '#22c55e') : chip(uiText('generatedUi.u_ads_notready'), '#fb923c')}
              </div>
              <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, margin: '8px 0 0' }}>{platform.id}</p>
              <ConnectionRow platform={platform} />
              <NetworkSetupPanel platform={platform} onStaged={load} />
            </div>
          ))}
        </div>

        {(data?.unavailable || []).length ? (
          <div style={{ marginTop: 14 }}>
            <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 12, margin: '0 0 6px', fontWeight: 800 }}>{uiText('generatedUi.u_ads_unavailable')}</p>
            {(data?.unavailable || []).map(item => (
              <p key={item.id} style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, margin: '0 0 4px' }}>{item.id} — {item.reason}</p>
            ))}
          </div>
        ) : null}
      </section>

      {(data?.attention || []).length ? (
        <section style={panel}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{uiText('generatedUi.u_ads_attention')}</h2>
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            {(data?.attention || []).map(item => (
              <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ color: item.severity === 'critical' ? '#f87171' : item.severity === 'warning' ? '#fb923c' : 'rgba(255,255,255,.4)', fontWeight: 900, fontSize: 12 }}>
                  {item.severity === 'critical' ? '!!' : item.severity === 'warning' ? '!' : '·'}
                </span>
                <p style={{ color: 'rgba(255,255,255,.8)', fontSize: 12, margin: 0 }}>
                  <strong style={{ color: '#fff' }}>{item.subject}</strong> — {item.message}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <BillingPanel platforms={data?.platforms || []} health={data?.health || []} onSubmit={post} />
      <CeilingPanel platforms={data?.platforms || []} ceilings={data?.ceilings || []} onSubmit={post} />
      <StartPanel platforms={readyPlatforms} onSubmit={post} />

      <section style={panel}>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{uiText('generatedUi.u_ads_campaigns')}</h2>
        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '6px 0 14px' }}>{uiText('generatedUi.u_ads_campaignsnote')}</p>
        {(data?.campaigns || []).length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, margin: 0 }}>{uiText('generatedUi.u_ads_nocampaigns')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    uiText('generatedUi.u_ads_colname'),
                    uiText('generatedUi.u_ads_colnetwork'),
                    uiText('generatedUi.u_ads_colcap'),
                    uiText('generatedUi.u_ads_colspent'),
                    uiText('generatedUi.u_ads_colstatus'),
                    uiText('generatedUi.u_ads_colactions'),
                  ].map(head => (
                    <th key={head} style={{ ...cell, color: 'rgba(255,255,255,.55)', fontWeight: 800, textAlign: 'left' }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.campaigns || []).map(campaign => (
                  <tr key={campaign.id}>
                    <td style={cell}>
                      {campaign.name}
                      <div style={{ color: 'rgba(255,255,255,.42)', fontSize: 10 }}>{campaign.campaignRef || '—'}</div>
                    </td>
                    <td style={cell}>{campaign.platformId}<div style={{ color: 'rgba(255,255,255,.42)', fontSize: 10 }}>{campaign.accountRef}</div></td>
                    <td style={cell}>{campaign.capDisplay}</td>
                    <td style={cell}>
                      {campaign.spentDisplay}
                      {campaign.overCap ? <div style={{ marginTop: 4 }}>{chip(uiText('generatedUi.u_ads_overcap'), '#f87171')}</div> : null}
                      {campaign.reconcileError ? <div style={{ color: '#fca5a5', fontSize: 10, marginTop: 4 }}>{campaign.reconcileError}</div> : null}
                    </td>
                    <td style={cell}>{campaign.status}</td>
                    <td style={cell}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button style={ghost} onClick={() => post({ action: 'reconcile', ledgerId: campaign.id })}>{uiText('generatedUi.u_ads_reconcile')}</button>
                        <button style={ghost} onClick={() => post({ action: 'pause', ledgerId: campaign.id })}>{uiText('generatedUi.u_ads_pause')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

/**
 * Connecting a network, and what the connection is worth.
 *
 * A token is not a setting — it expires. Meta and LinkedIn last about sixty days, Pinterest
 * thirty, and TikTok, Snapchat and Reddit issue tokens measured in hours. So this shows the
 * expiry beside the connection rather than a green tick, and says plainly that renewal is
 * automatic: the useful question is not "is it connected" but "will it still be connected
 * next week".
 */
function ConnectionRow({ platform }: { platform: Platform }) {
  const connection = platform.connection

  if (!platform.canConnect && !connection) {
    // X and Microsoft do not speak OAuth 2. Saying so here is better than a button that
    // opens an error page and teaches the buyer the integration is broken.
    return <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, margin: '8px 0 0' }}>{uiText('generatedUi.u_ads_cannotconnect')}</p>
  }

  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
      {connection ? (
        <div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {chip(uiText('generatedUi.u_ads_connected'), '#22c55e')}
            {connection.expiresAt ? (
              <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 10 }}>
                {uiText('generatedUi.u_ads_expires')} {new Date(connection.expiresAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>
          <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 10, margin: '4px 0 0' }}>{uiText('generatedUi.u_ads_autorenew')}</p>
          {connection.lastError ? (
            <p style={{ color: '#fca5a5', fontSize: 10, margin: '4px 0 0' }}>
              {uiText('generatedUi.u_ads_lasterror')}: {connection.lastError}
            </p>
          ) : null}
        </div>
      ) : null}

      {platform.canConnect ? (
        <button
          style={connection ? { ...ghost, padding: '6px 10px', fontSize: 11 } : button}
          onClick={() => { window.location.href = `/api/ads/oauth?platform=${encodeURIComponent(platform.id)}` }}
        >
          {connection ? uiText('generatedUi.u_ads_reconnect') : uiText('generatedUi.u_ads_connect')}
        </button>
      ) : null}
    </div>
  )
}

function NetworkSetupPanel({ platform, onStaged }: { platform: Platform; onStaged: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [staging, setStaging] = useState(false)
  const [note, setNote] = useState('')
  const [failure, setFailure] = useState('')

  const setup = platform.setup
  if (!setup) return null

  const outstanding = setup.vars.filter(item => item.required && !item.present)
  const filled = outstanding.every(item => String(values[item.key] || '').trim())

  async function stage() {
    setStaging(true); setNote(''); setFailure('')
    try {
      const res = await fetch('/api/ads/connect-via-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ network: platform.id, values }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || `${res.status}`)
      setValues({})
      setNote(String(json.next || ''))
      onStaged()
    } catch (error: any) {
      setFailure(String(error?.message || error))
    }
    setStaging(false)
  }

  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ color: '#1af0ff', cursor: 'pointer', fontSize: 12, fontWeight: 850 }}>{uiText('generatedUi.u_ads_methods')}</summary>
      <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>

        {/* What the network itself demands. No path here can supply it. */}
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 11, margin: 0 }}>
          <strong style={{ color: 'rgba(255,255,255,.8)' }}>{uiText('generatedUi.u_ads_prerequisite')}</strong> {setup.prerequisite}
        </p>

        {/* Path 1 — the operator does it. First-class, always available, no AI dependence. */}
        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{uiText('generatedUi.u_ads_manualtitle')}</p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}>{uiText('generatedUi.u_ads_manualnote')}</p>
          <div style={{ display: 'grid', gap: 4 }}>
            {setup.vars.map(item => (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                <code style={{ color: item.present ? 'rgba(255,255,255,.6)' : '#1af0ff' }}>{item.key}</code>
                <span style={{ color: item.present ? '#22c55e' : item.required ? '#fb923c' : 'rgba(255,255,255,.4)' }}>
                  {item.present ? uiText('generatedUi.u_ads_varset') : item.required ? uiText('generatedUi.u_ads_varmissing') : uiText('generatedUi.u_ads_varoptional')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Path 2 — staged as an infrastructure PR the owner reviews and merges. */}
        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>{uiText('generatedUi.u_ads_prtitle')}</p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: '0 0 8px' }}>{uiText('generatedUi.u_ads_prnote')}</p>

          {outstanding.length === 0 ? (
            <p style={{ color: '#86efac', fontSize: 11, margin: 0 }}>{uiText('generatedUi.u_ads_allset')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {outstanding.map(item => (
                <div key={item.key}>
                  <span style={label}>{item.label}</span>
                  <input
                    style={input}
                    // A value that grants spending power is never echoed back into the page.
                    type={item.secret ? 'password' : 'text'}
                    value={values[item.key] || ''}
                    onChange={event => setValues({ ...values, [item.key]: event.target.value })}
                    placeholder={item.key}
                  />
                  {item.hint ? <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 10, margin: '3px 0 0' }}>{item.hint}</p> : null}
                </div>
              ))}
              <button style={{ ...ghost, opacity: filled && !staging ? 1 : .5 }} disabled={!filled || staging} onClick={stage}>
                {staging ? uiText('generatedUi.u_ads_staging') : uiText('generatedUi.u_ads_stage')}
              </button>
            </div>
          )}

          {note ? <p style={{ color: '#86efac', fontSize: 11, margin: '8px 0 0' }}>{note} <a href="/dashboard/infrastructure" style={{ color: '#1af0ff' }}>{uiText('generatedUi.u_ads_reviewpr')}</a></p> : null}
          {failure ? <p style={{ color: '#fca5a5', fontSize: 11, margin: '8px 0 0' }}>{failure}</p> : null}
        </div>

        {/* Path 3 — the assisted co-pilot. Honest about not being wired yet. */}
        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', paddingTop: 10 }}>
          <p style={{ color: '#fff', fontSize: 12, fontWeight: 850, margin: '0 0 4px' }}>
            {uiText('generatedUi.u_ads_agenttitle')} <span style={{ color: '#ffc300', fontWeight: 700 }}>{uiText('generatedUi.u_ads_agentsoon')}</span>
          </p>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}>{uiText('generatedUi.u_ads_agentnote')}</p>
        </div>
      </div>
    </details>
  )
}

/**
 * The ad account is PICKED, never typed.
 *
 * A wrong account reference spends against someone else's budget and reports someone else's
 * numbers, and the network already knows the right one — so this asks it rather than asking
 * a person. The currency travels with the selection for the same reason: it is the other
 * field where a typo is a hundredfold error.
 *
 * A manual entry is still possible, because some networks publish no account list and a
 * buyer must not be blocked by that. It is the fallback, not the default.
 */
function AccountPicker({ platformId, value, onPick }: {
  platformId: string
  value: string
  onPick: (account: { accountRef: string; currency: string | null } | null) => void
}) {
  const [accounts, setAccounts] = useState<DiscoveredAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [problem, setProblem] = useState('')
  const [manual, setManual] = useState(false)

  useEffect(() => { setAccounts([]); setProblem(''); setFilter(''); setManual(false) }, [platformId])

  async function load() {
    if (!platformId) return
    setLoading(true); setProblem('')
    try {
      const res = await fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'discover_accounts', platformId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || `${res.status}`)
      setAccounts(json.accounts || [])
    } catch (error: any) {
      // Shown rather than swallowed: an empty dropdown and a refused request look identical
      // and mean opposite things.
      setProblem(String(error?.message || error))
    }
    setLoading(false)
  }

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return accounts
    return accounts.filter(account => account.label.toLowerCase().includes(needle))
  }, [accounts, filter])

  if (manual) {
    return (
      <div>
        <span style={label}>{uiText('generatedUi.u_ads_account')}</span>
        <input style={input} value={value} onChange={event => onPick({ accountRef: event.target.value, currency: null })} placeholder={uiText('generatedUi.u_ads_accounthint')} />
        <button style={{ ...ghost, marginTop: 6, padding: '5px 9px', fontSize: 11 }} onClick={() => setManual(false)}>{uiText('generatedUi.u_ads_pickinstead')}</button>
      </div>
    )
  }

  return (
    <div>
      <span style={label}>{uiText('generatedUi.u_ads_account')}</span>
      {accounts.length === 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <button style={{ ...ghost, opacity: platformId && !loading ? 1 : .5 }} disabled={!platformId || loading} onClick={load}>
            {loading ? uiText('generatedUi.u_ads_loadingaccounts') : uiText('generatedUi.u_ads_loadaccounts')}
          </button>
          {problem ? <p style={{ color: '#fca5a5', fontSize: 11, margin: 0 }}>{problem}</p> : null}
          <button style={{ ...ghost, padding: '5px 9px', fontSize: 11 }} onClick={() => setManual(true)}>{uiText('generatedUi.u_ads_entermanually')}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <input style={input} value={filter} onChange={event => setFilter(event.target.value)} placeholder={uiText('generatedUi.u_ads_filteraccounts')} />
          <div style={{ maxHeight: 168, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {shown.map(account => (
              <button
                key={account.accountRef}
                style={{
                  ...ghost,
                  textAlign: 'left',
                  fontSize: 11,
                  borderColor: value === account.accountRef ? '#ffc300' : 'rgba(255,255,255,.18)',
                }}
                onClick={() => onPick({ accountRef: account.accountRef, currency: account.currency })}
              >
                {account.label}
              </button>
            ))}
            {shown.length === 0 ? <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, margin: 0 }}>{uiText('generatedUi.u_ads_nomatch')}</p> : null}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * How each ad account pays.
 *
 * The options come from the network rather than from a shared list, because offering a buyer
 * an arrangement their network does not have is the same class of error as a free-text box.
 * A buyer who already advertises somewhere is not asked to describe their setup — they pick
 * the account, and the arrangement follows.
 */
function BillingPanel({ platforms, health, onSubmit }: {
  platforms: Platform[]
  health: Health[]
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>
}) {
  const [platformId, setPlatformId] = useState('')
  const [accountRef, setAccountRef] = useState('')
  const [currency, setCurrency] = useState('')
  const [mode, setMode] = useState('')
  const [invoiceDueAt, setInvoiceDueAt] = useState('')
  const [cardLast4, setCardLast4] = useState('')
  const [cardExpiresOn, setCardExpiresOn] = useState('')
  const [balance, setBalance] = useState('')
  const [error, setError] = useState('')

  const platform = platforms.find(item => item.id === platformId) || null
  const arrangements = platform?.arrangements || []
  const chosen = arrangements.find(item => item.id === mode) || null
  const ready = Boolean(platformId && accountRef.trim() && mode)

  function convert(value: string) {
    return toMinorUnits(value.trim(), 'major', currency || 'USD') as { ok: boolean; minor?: number; reason?: string }
  }

  async function submit() {
    setError('')
    let balanceMinor: number | undefined
    if (balance.trim()) {
      const converted = convert(balance)
      if (converted.ok !== true) { setError(String(converted.reason)); return }
      balanceMinor = converted.minor
    }
    const done = await onSubmit({
      action: 'set_billing',
      platformId,
      accountRef: accountRef.trim(),
      billingMode: mode,
      currency: currency || undefined,
      invoiceDueAt: invoiceDueAt || undefined,
      cardLast4: cardLast4.trim() || undefined,
      cardExpiresOn: cardExpiresOn || undefined,
      balanceMinor,
    })
    if (done) { setInvoiceDueAt(''); setCardLast4(''); setCardExpiresOn(''); setBalance('') }
  }

  return (
    <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{uiText('generatedUi.u_ads_billing')}</h2>
      <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '6px 0 14px' }}>{uiText('generatedUi.u_ads_billingnote')}</p>

      {health.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {health.map(row => (
            <span key={`${row.platformId}:${row.accountRef}`} style={{ border: '1px solid rgba(148,163,184,.25)', borderRadius: 12, padding: '6px 10px', fontSize: 11, color: 'rgba(255,255,255,.8)' }}>
              {row.platformId} · {row.accountRef} · <strong style={{ color: row.billingMode === 'unknown' ? '#fb923c' : '#ffc300' }}>{row.billingMode}</strong>
              {row.currency ? ` · ${row.currency}` : ''}
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div>
          <span style={label}>{uiText('generatedUi.u_ads_network')}</span>
          <select style={input} value={platformId} onChange={event => { setPlatformId(event.target.value); setAccountRef(''); setCurrency(''); setMode('') }}>
            <option value="">{uiText('generatedUi.u_ads_choose')}</option>
            {platforms.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>

        <AccountPicker
          platformId={platformId}
          value={accountRef}
          onPick={account => {
            setAccountRef(account?.accountRef || '')
            // The network's own currency wins over anything a person would have chosen.
            if (account?.currency) setCurrency(account.currency)
          }}
        />

        <div>
          <span style={label}>{uiText('generatedUi.u_ads_arrangement')}</span>
          <select style={input} value={mode} onChange={event => setMode(event.target.value)} disabled={!platformId}>
            <option value="">{uiText('generatedUi.u_ads_choose')}</option>
            {arrangements.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>

        <div>
          <span style={label}>{uiText('generatedUi.u_ads_currency')}</span>
          {currency ? (
            <div>
              <p style={{ color: '#fff', fontSize: 13, margin: '6px 0 0', fontWeight: 800 }}>{currency}</p>
              <p style={{ color: '#86efac', fontSize: 10, margin: '2px 0 0' }}>{uiText('generatedUi.u_ads_currencyfromnetwork')}</p>
            </div>
          ) : (
            <select style={input} value={currency} onChange={event => setCurrency(event.target.value)}>
              <option value="">{uiText('generatedUi.u_ads_choose')}</option>
              {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          )}
        </div>
      </div>

      {chosen ? (
        <div style={{ borderTop: '1px solid rgba(148,163,184,.18)', marginTop: 12, paddingTop: 12 }}>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, margin: 0 }}>{chosen.description}</p>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, margin: '4px 0 0' }}>{chosen.eligibility}</p>

          {/* Only the fields this arrangement can actually fail on. */}
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 10 }}>
            {mode === 'invoiced' ? (
              <div>
                <span style={label}>{uiText('generatedUi.u_ads_invoiceduelabel')}</span>
                <input style={input} type="date" value={invoiceDueAt} onChange={event => setInvoiceDueAt(event.target.value)} />
              </div>
            ) : null}
            {mode === 'card' ? (
              <div>
                <span style={label}>{uiText('generatedUi.u_ads_cardlast4')}</span>
                <input style={input} value={cardLast4} maxLength={4} onChange={event => setCardLast4(event.target.value)} placeholder="4242" />
              </div>
            ) : null}
            {mode === 'card' ? (
              <div>
                <span style={label}>{uiText('generatedUi.u_ads_cardexpiry')}</span>
                <input style={input} type="date" value={cardExpiresOn} onChange={event => setCardExpiresOn(event.target.value)} />
              </div>
            ) : null}
            {mode === 'prepaid' ? (
              <div>
                <span style={label}>{uiText('generatedUi.u_ads_balancelabel')}</span>
                <input style={input} value={balance} onChange={event => setBalance(event.target.value)} placeholder={uiText('generatedUi.u_ads_amounthint')} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p style={{ color: '#fca5a5', fontSize: 12, margin: '10px 0 0' }}>{error}</p> : null}
      <button style={{ ...button, marginTop: 12, opacity: ready ? 1 : .5 }} disabled={!ready} onClick={submit}>{uiText('generatedUi.u_ads_savebilling')}</button>
    </section>
  )
}

function CeilingPanel({ platforms, ceilings, onSubmit }: {
  platforms: Platform[]
  ceilings: Ceiling[]
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>
}) {
  const [platformId, setPlatformId] = useState('')
  const [accountRef, setAccountRef] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [error, setError] = useState('')

  const ready = Boolean(platformId && accountRef.trim() && amount.trim())

  async function submit() {
    setError('')
    // Same conversion the ad networks use, so a yen ceiling is not silently multiplied by
    // a hundred. Flattened rather than narrowed: this repo does not compile with strict
    // null checks, and narrowing a discriminated union has already broken one build.
    const converted = toMinorUnits(amount.trim(), 'major', currency) as { ok: boolean; minor?: number; reason?: string }
    if (converted.ok !== true) { setError(String(converted.reason)); return }
    await onSubmit({ action: 'set_ceiling', platformId, accountRef: accountRef.trim(), ceilingMinor: converted.minor, currency })
    setAmount('')
  }

  return (
    <section style={panel}>
      <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{uiText('generatedUi.u_ads_ceilings')}</h2>
      <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '6px 0 14px' }}>{uiText('generatedUi.u_ads_ceilingsnote')}</p>

      {ceilings.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {ceilings.map(item => (
            <span key={`${item.platformId}:${item.accountRef}`} style={{ border: '1px solid rgba(148,163,184,.25)', borderRadius: 12, padding: '6px 10px', fontSize: 12, color: 'rgba(255,255,255,.8)' }}>
              {item.platformId} · {item.accountRef} · <strong style={{ color: '#ffc300' }}>{item.display}</strong>
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div>
          <span style={label}>{uiText('generatedUi.u_ads_network')}</span>
          <select style={input} value={platformId} onChange={event => setPlatformId(event.target.value)}>
            <option value="">{uiText('generatedUi.u_ads_choose')}</option>
            {platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.label}</option>)}
          </select>
        </div>
        <AccountPicker
          platformId={platformId}
          value={accountRef}
          onPick={account => { setAccountRef(account?.accountRef || ''); if (account?.currency) setCurrency(account.currency) }}
        />
        <div>
          <span style={label}>{uiText('generatedUi.u_ads_ceilingamount')}</span>
          <input style={input} value={amount} onChange={event => setAmount(event.target.value)} placeholder={uiText('generatedUi.u_ads_amounthint')} />
        </div>
        <div>
          <span style={label}>{uiText('generatedUi.u_ads_currency')}</span>
          <select style={input} value={currency} onChange={event => setCurrency(event.target.value)}>
            {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
      </div>

      {error ? <p style={{ color: '#fca5a5', fontSize: 12, margin: '10px 0 0' }}>{error}</p> : null}
      <button style={{ ...button, marginTop: 12, opacity: ready ? 1 : .5 }} disabled={!ready} onClick={submit}>{uiText('generatedUi.u_ads_saveceiling')}</button>
    </section>
  )
}

function StartPanel({ platforms, onSubmit }: {
  platforms: Platform[]
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [platformId, setPlatformId] = useState('')
  const [accountRef, setAccountRef] = useState('')
  const [name, setName] = useState('')
  const [landingUrl, setLandingUrl] = useState('')
  const [headline, setHeadline] = useState('')
  const [amount, setAmount] = useState('')
  const [dailyAmount, setDailyAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [contentApprovedBy, setContentApprovedBy] = useState('')
  const [spendApprovedBy, setSpendApprovedBy] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')

  // The button stays disabled until the request would pass the route's gate: a network, an
  // account, a landing URL, a cap, and BOTH approvers. The interface cannot attempt a
  // campaign the gate would refuse, which is the same rule the runtime and the table use.
  const ready = Boolean(
    platformId && accountRef.trim() && name.trim() && landingUrl.trim() &&
    amount.trim() && contentApprovedBy.trim() && spendApprovedBy.trim(),
  )

  function convert(value: string) {
    return toMinorUnits(value.trim(), 'major', currency) as { ok: boolean; minor?: number; reason?: string }
  }

  useEffect(() => {
    if (!amount.trim()) { setPreview(''); return }
    const converted = convert(amount)
    setPreview(converted.ok === true ? formatMinor(Number(converted.minor), currency) : '')
  }, [amount, currency])

  async function submit() {
    setError('')
    const cap = convert(amount)
    if (cap.ok !== true) { setError(String(cap.reason)); return }
    let dailyMinor: number | undefined
    if (dailyAmount.trim()) {
      const daily = convert(dailyAmount)
      if (daily.ok !== true) { setError(String(daily.reason)); return }
      dailyMinor = daily.minor
    }
    const done = await onSubmit({
      action: 'start',
      platformId,
      accountRef: accountRef.trim(),
      name: name.trim(),
      landingUrl: landingUrl.trim(),
      headline: headline.trim() || undefined,
      currency,
      campaignMaxMinor: cap.minor,
      dailyMaxMinor: dailyMinor,
      contentApprovedBy: contentApprovedBy.trim(),
      spendApprovedBy: spendApprovedBy.trim(),
    })
    if (done) { setName(''); setAmount(''); setDailyAmount(''); setHeadline('') }
  }

  return (
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{uiText('generatedUi.u_ads_start')}</h2>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, margin: '6px 0 0' }}>{uiText('generatedUi.u_ads_startnote')}</p>
        </div>
        <button style={ghost} onClick={() => setOpen(!open)}>{open ? uiText('generatedUi.u_ads_close') : uiText('generatedUi.u_ads_open')}</button>
      </div>

      {open ? (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_network')}</span>
              <select style={input} value={platformId} onChange={event => setPlatformId(event.target.value)}>
                <option value="">{uiText('generatedUi.u_ads_choose')}</option>
                {platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.label}</option>)}
              </select>
            </div>
            <AccountPicker
              platformId={platformId}
              value={accountRef}
              onPick={account => { setAccountRef(account?.accountRef || ''); if (account?.currency) setCurrency(account.currency) }}
            />
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_campaignname')}</span>
              <input style={input} value={name} onChange={event => setName(event.target.value)} />
            </div>
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_landing')}</span>
              <input style={input} value={landingUrl} onChange={event => setLandingUrl(event.target.value)} placeholder={uiText('generatedUi.u_ads_landinghint')} />
            </div>
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_headline')}</span>
              <input style={input} value={headline} onChange={event => setHeadline(event.target.value)} />
            </div>
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_currency')}</span>
              <select style={input} value={currency} onChange={event => setCurrency(event.target.value)}>
                {CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_cap')}</span>
              <input style={input} value={amount} onChange={event => setAmount(event.target.value)} placeholder={uiText('generatedUi.u_ads_amounthint')} />
              {preview ? <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, margin: '4px 0 0' }}>{preview}</p> : null}
            </div>
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_daily')}</span>
              <input style={input} value={dailyAmount} onChange={event => setDailyAmount(event.target.value)} placeholder={uiText('generatedUi.u_ads_amounthint')} />
            </div>
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_contentapprover')}</span>
              <input style={input} value={contentApprovedBy} onChange={event => setContentApprovedBy(event.target.value)} />
            </div>
            <div>
              <span style={label}>{uiText('generatedUi.u_ads_spendapprover')}</span>
              <input style={input} value={spendApprovedBy} onChange={event => setSpendApprovedBy(event.target.value)} />
            </div>
          </div>

          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11, margin: 0 }}>{uiText('generatedUi.u_ads_approvernote')}</p>
          <p style={{ color: '#86efac', fontSize: 11, margin: 0 }}>{uiText('generatedUi.u_ads_pausednote')}</p>
          {error ? <p style={{ color: '#fca5a5', fontSize: 12, margin: 0 }}>{error}</p> : null}

          <div>
            <button style={{ ...button, opacity: ready ? 1 : .5 }} disabled={!ready} onClick={submit}>{uiText('generatedUi.u_ads_create')}</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
