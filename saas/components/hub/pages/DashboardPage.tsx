'use client'

// saas/components/hub/pages/DashboardPage.tsx
// Console Page 1 — Dashboard (Hub): provider overview, alerts, system health.

import { useState } from 'react'
import { PageProps, c, TONES, cardStyle, bodyStyle, labelStyle, rowStyle, monoStyle, Dot, Band, Status, ActionButton, DetailsToggle } from '../shared'

type Role = 'billing' | 'dev' | 'team'

const MOCK_AUDIT: { time: string; actor: string; action: string; roles: Role[] }[] = [
  { time: 'Live', actor: 'system', action: 'Read-only provider monitoring enabled', roles: ['billing', 'dev', 'team'] },
  { time: 'Next', actor: 'planned', action: 'Approval workflow placeholder ready for future controlled actions', roles: ['billing', 'dev'] },
  { time: 'Next', actor: 'planned', action: 'Audit log foundation reserved for future provider changes', roles: ['billing', 'dev', 'team'] },
  { time: 'Next', actor: 'planned', action: 'Rollback snapshot area reserved for future configuration recovery', roles: ['dev'] },
  { time: 'Next', actor: 'planned', action: 'Role scope model prepared for billing, developer, and team views', roles: ['team', 'dev', 'billing'] },
]

export default function DashboardPage({ lang, data, loading, failed }: PageProps) {
  const [role, setRole] = useState<Role>('billing')
  const [scopeIdx, setScopeIdx] = useState(0)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }))
  const audit = MOCK_AUDIT.filter(e => e.roles.includes(role))
  const roleLabel: Record<Role, string> = { billing: c('roleBilling', lang), dev: c('roleDev', lang), team: c('roleTeam', lang) }

  const supaOk = !!data?.supabase.ok
  const stripeOk = !!data?.stripe.ok
  const vercelConfigured = !!data?.vercel.configured
  const scopes = data?.vercel.scopes || []
  const selScope = scopes[scopeIdx] || null
  const redAlerts = data?.alerts.stripeMismatches || []
  const yellowAlerts = data?.alerts.envSync || []
  const noAlerts = !loading && !failed && redAlerts.length === 0 && yellowAlerts.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Alerts */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, flexShrink: 0 }}>
        {loading && <div className="hub-loading" style={{ padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{c('loading', lang)}</div>}
        {failed && <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.09)', fontSize: 13 }}><span>⚠️</span>{c('loadError', lang)}</div>}
        {noAlerts && <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(34,197,94,.4)', background: 'rgba(34,197,94,.08)', fontSize: 13, color: '#86efac' }}><span>✅</span>{c('allClear', lang)}</div>}
        {redAlerts.map((a, i) => (
          <div key={'r' + i} className="hub-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 11, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.09)' }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>{a}</span>
            <a href="https://dashboard.stripe.com/prices" target="_blank" rel="noreferrer" className="hub-btn" style={{ padding: '6px 13px', borderRadius: 9, border: '1px solid rgba(239,68,68,.5)', background: 'rgba(239,68,68,.14)', color: '#fca5a5', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{c('fixStripe', lang)}</a>
          </div>
        ))}
        {yellowAlerts.map((a, i) => (
          <div key={'y' + i} className="hub-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 11, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.07)' }}>
            <span style={{ fontSize: 15 }}>⚠️</span>
            <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>{a}</span>
            <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="hub-btn" style={{ padding: '6px 13px', borderRadius: 9, border: '1px solid rgba(255,195,0,.5)', background: 'rgba(255,195,0,.12)', color: '#ffc300', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{c('fixVercel', lang)}</a>
          </div>
        ))}
      </section>

      {/* Provider cards */}
      <main className="hub-main" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(295px, 1fr))', gap: 14, flex: '1 1 auto', minHeight: 0, alignItems: 'start', alignContent: 'start', overflowY: 'auto', paddingBottom: 8 }}>

        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.green} icon="🗄️" title="Supabase" plain={c('yourData', lang)} sub={c('manageData', lang)} />
          <div style={bodyStyle}>
            <Status ok={supaOk} text={supaOk ? c('statusDb', lang) : c('statusDbDown', lang)} />
            {data && <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('latency', lang)}</span><span style={{ color: data.supabase.latencyMs < 400 ? '#22c55e' : '#ffc300', fontWeight: 700 }}>{data.supabase.latencyMs} ms</span></div>}
            <DetailsToggle open={!!open.supa} onClick={() => toggle('supa')} lang={lang} />
            {open.supa && data && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('projectUrl', lang)}</span><span style={monoStyle}>{data.supabase.projectHost}</span></div>
                <div style={rowStyle}><span style={{ color: 'rgba(255,255,255,.6)' }}>{c('anonKey', lang)}</span><span style={monoStyle}>{data.supabase.anonKeyMasked}</span></div>
                {data.supabase.error && <div style={{ ...rowStyle, color: '#fca5a5' }}>{data.supabase.error}</div>}
              </div>
            )}
            <ActionButton tone={TONES.green} label={c('openSupabase', lang)} href="https://supabase.com/dashboard/project/qpblefwtnbivuusxmabv" />
          </div>
        </section>

        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.blue} icon="💳" title="Stripe" plain={c('yourPayments', lang)} sub={c('managePay', lang)} />
          <div style={bodyStyle}>
            <Status ok={stripeOk} text={stripeOk ? c('statusPay', lang) : c('statusPayDown', lang)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(data?.stripe.tiers || []).map(t => (
                <div key={t.priceId} style={rowStyle}>
                  <span style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  <span style={{ color: '#ffc300', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>${t.amount}<span style={{ color: 'rgba(255,255,255,.45)', fontWeight: 400, fontSize: 11.5 }}>/{t.interval}</span></span>
                </div>
              ))}
              {loading && <div className="hub-loading" style={{ ...rowStyle, color: 'rgba(255,255,255,.5)' }}>{c('loading', lang)}</div>}
            </div>
            <DetailsToggle open={!!open.stripe} onClick={() => toggle('stripe')} lang={lang} />
            {open.stripe && data && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={labelStyle}>{c('webhooks', lang)}</div>
                {data.stripe.webhooks.map(w => (
                  <div key={w.url} style={rowStyle}>
                    <span style={{ ...monoStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url.replace('https://', '')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><Dot tone={w.status === 'enabled' ? 'green' : 'red'} /><span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.55)' }}>{w.events} {c('events', lang)}</span></span>
                  </div>
                ))}
                <div style={labelStyle}>{c('priceIds', lang)}</div>
                {data.stripe.tiers.map(t => (<div key={'id' + t.priceId} style={rowStyle}><span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span><span style={{ ...monoStyle, flexShrink: 0 }}>{t.priceId.slice(0, 18)}…</span></div>))}
              </div>
            )}
            <ActionButton tone={TONES.blue} label={c('openStripe', lang)} href="https://dashboard.stripe.com" />
          </div>
        </section>

        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.purple} icon="🌐" title="Vercel" plain={c('yourWebsite', lang)} sub={c('manageHost', lang)} />
          <div style={bodyStyle}>
            <Status ok={vercelConfigured && !!data?.vercel.ok} text={vercelConfigured ? c('statusHost', lang) : c('statusNoToken', lang)} />
            {!vercelConfigured && !loading && <div style={{ ...rowStyle, fontSize: 12.5, color: 'rgba(255,255,255,.6)' }}>{c('tokenHint', lang)}</div>}
            {vercelConfigured && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {scopes.map((s, i) => (
                  <button key={s.scope} onClick={() => setScopeIdx(i)} className="hub-chip" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, background: scopeIdx === i ? TONES.purple.soft : 'rgba(255,255,255,.04)', border: scopeIdx === i ? `1px solid ${TONES.purple.border}` : '1px solid rgba(255,255,255,.12)', color: scopeIdx === i ? '#c4b5fd' : 'rgba(255,255,255,.6)' }}>{s.scope}<span style={{ color: 'rgba(255,255,255,.5)' }}>{s.count}</span></button>
                ))}
              </div>
            )}
            {vercelConfigured && selScope && (
              <>
                <DetailsToggle open={!!open.vercel} onClick={() => toggle('vercel')} lang={lang} />
                {open.vercel && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={labelStyle}>{c('envVars', lang)}</div>
                    {selScope.names.map(v => (<div key={v} style={rowStyle}><span style={monoStyle}>{v}</span><span style={{ ...monoStyle, color: 'rgba(255,255,255,.35)' }}>••••••••</span></div>))}
                  </div>
                )}
              </>
            )}
            {data?.vercel.error && <div style={{ ...rowStyle, color: '#fca5a5', fontSize: 12.5 }}>{data.vercel.error}</div>}
            <ActionButton tone={TONES.purple} label={c('openVercel', lang)} href="https://vercel.com/dashboard" />
          </div>
        </section>

        <section className="hub-card hub-panel" style={cardStyle}>
          <Band tone={TONES.gray} icon="👥" title="Governance" plain={c('yourTeam', lang)} sub={c('manageTeam', lang)} />
          <div style={bodyStyle}>
            <Status ok={true} text={c('statusRoles', lang)} />
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {(['billing', 'dev', 'team'] as Role[]).map(r => (
                <button key={r} onClick={() => setRole(r)} className="hub-chip" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: role === r ? 'rgba(255,195,0,.14)' : 'rgba(255,255,255,.04)', border: role === r ? '1px solid rgba(255,195,0,.55)' : '1px solid rgba(255,255,255,.12)', color: role === r ? '#ffc300' : 'rgba(255,255,255,.6)' }}>{roleLabel[r]}</button>
              ))}
            </div>
            <div style={labelStyle}>{c('timeline', lang)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(open.gov ? audit : audit.slice(0, 2)).map((e, i) => (
                <div key={i} style={{ ...rowStyle, alignItems: 'flex-start', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10 }}><span style={{ ...monoStyle, color: '#1af0ff' }}>{e.time}</span><span style={{ ...monoStyle, color: 'rgba(255,255,255,.45)' }}>{e.actor}</span></div>
                  <div style={{ fontSize: 12.5 }}>{e.action}</div>
                </div>
              ))}
            </div>
            {audit.length > 2 && <DetailsToggle open={!!open.gov} onClick={() => toggle('gov')} lang={lang} />}
            <ActionButton tone={TONES.gray} label={c('openTeam', lang)} href="/admin/settings/roles" />
          </div>
        </section>

        <section className="hub-panel" style={{ ...cardStyle, border: '1px dashed rgba(255,255,255,.18)', background: 'rgba(255,255,255,.02)', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 10, padding: 18, minHeight: 200 }}>
          <span style={{ fontSize: 26, opacity: .8 }}>➕</span>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>{c('futureTitle', lang)}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.45)', maxWidth: 260 }}>{c('futureNote', lang)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['OpenAI', 'Anthropic', 'ElevenLabs'].map(p => (<span key={p} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(26,240,255,.25)', color: 'rgba(26,240,255,.7)', fontSize: 11.5 }}>{p}</span>))}
          </div>
        </section>

      </main>
    </div>
  )
}
