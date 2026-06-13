'use client'

// saas/components/hub/pages/ProviderExpansionPage.tsx
// Business Operating Partners — Operations & Production first, monitoring second.

import { useEffect, useMemo, useState } from 'react'
import { PageProps, TONES, cardStyle, labelStyle } from '../shared'

type PartnerIdea = { name: string; subtitle: string; visual: string[]; monitor: string[]; why: string; phase: 'Phase 1' | 'Phase 2' | 'Phase 3' }
type PartnerPage = { id: string; icon: string; title: string; subtitle: string; partners: PartnerIdea[] }

const PREF_KEY = 'signalboost:enabledOperatingPartners'
const oldPrefKey = 'signalboost:enabledProviders'
const op = (name: string, subtitle: string, phase: PartnerIdea['phase'], visual: string[], monitor: string[], why: string): PartnerIdea => ({ name, subtitle, phase, visual, monitor, why })

const PAGES: PartnerPage[] = [
  { id: 'mission-critical', icon: '⭐', title: 'Mission Critical Partners', subtitle: 'Operations & Production starts here: data, hosting, revenue, and source control.', partners: [
    op('Supabase', 'Database, auth, storage', 'Phase 1', ['Data', 'Users', 'Storage', 'Keys'], ['Database health', 'Auth status', 'Storage policy review', 'Environment key coverage'], 'If Supabase fails, users, data, and authentication are affected.'),
    op('Vercel', 'Hosting and deployments', 'Phase 1', ['Hosting', 'Deploys', 'Domains', 'Env'], ['Deployment health', 'Build failures', 'Domain and SSL status', 'Environment drift'], 'If Vercel fails, the website or application can go offline.'),
    op('Stripe', 'Revenue and billing', 'Phase 1', ['Revenue', 'Plans', 'Webhooks', 'Billing'], ['Price configuration', 'Webhook health', 'Payment status', 'Billing risk'], 'If Stripe fails, revenue and subscriptions are affected.'),
    op('GitHub', 'Code and release flow', 'Phase 1', ['Repos', 'Branches', 'PRs', 'Access'], ['Repository activity', 'Release visibility', 'Open PR summary', 'Access review guidance'], 'If GitHub is blocked, releases and deployment workflow are affected.'),
  ]},
  { id: 'growth-ai', icon: '🧠', title: 'Growth Partners — AI', subtitle: 'AI usage, model availability, cost, and key governance.', partners: [
    op('OpenAI', 'AI usage and cost', 'Phase 1', ['Usage', 'Cost', 'Limits', 'Models'], ['Usage visibility', 'Cost spike alerts', 'Rate-limit alerts', 'Credential age reminders'], 'AI usage can become expensive quickly. Owners need cost and limit visibility.'),
    op('Anthropic', 'Claude API', 'Phase 2', ['Usage', 'Cost', 'Limits', 'Access'], ['Usage visibility', 'Cost alerts', 'Limit warnings', 'Access review'], 'AI providers need cost and usage visibility just like cloud providers.'),
  ]},
  { id: 'cloud', icon: '☁️', title: 'Infrastructure Partners — Cloud', subtitle: 'Cloud platforms and small-cloud infrastructure.', partners: [
    op('AWS', 'Cloud operations', 'Phase 1', ['IAM', 'S3', 'Compute', 'Alerts'], ['Access review reminders', 'Storage exposure checks', 'Unused credential reminders', 'Cloud health signals'], 'AWS is powerful but complex. SignalBoost should make the most important risks easy to understand.'),
    op('Google Cloud', 'Cloud accounts and apps', 'Phase 2', ['Accounts', 'OAuth', 'Roles', 'Projects'], ['Account inventory', 'Role visibility', 'App review reminders', 'Environment mapping'], 'Google Cloud configuration can sprawl. SignalBoost should turn it into a clear checklist.'),
    op('Azure', 'Enterprise identity/cloud', 'Phase 2', ['Apps', 'Certificates', 'Roles', 'Tenant'], ['App expiration reminders', 'Certificate checks', 'Role visibility', 'Configuration warnings'], 'Azure identity and app settings need calm, readable monitoring.'),
    op('DigitalOcean', 'Cloud infrastructure', 'Phase 1', ['Droplets', 'Spaces', 'Firewalls', 'Usage'], ['Droplet health', 'Storage usage', 'Firewall review', 'Account usage'], 'Small teams need cloud hygiene without a full DevOps department.'),
  ]},
  { id: 'edge-app', icon: '🌐', title: 'Application + Edge Partners', subtitle: 'Application configuration, DNS, SSL, rules, and edge protection.', partners: [
    op('Cloudflare', 'DNS and edge', 'Phase 1', ['DNS', 'SSL', 'Workers', 'Proxy'], ['DNS health', 'SSL status', 'Worker status', 'Proxy review'], 'Cloudflare sits in front of everything. Small mistakes can affect the whole business.'),
    op('Firebase', 'App backend', 'Phase 1', ['Auth', 'Rules', 'Storage', 'Usage'], ['Auth configuration', 'Rules review', 'Storage status', 'Usage visibility'], 'Firebase grows quickly and configuration drift is easy to miss.'),
  ]},
  { id: 'communication', icon: '✉️', title: 'Communication Partners', subtitle: 'Customer messaging, verification, and transactional email.', partners: [
    op('Twilio', 'SMS and verification', 'Phase 1', ['SMS', 'Verify', 'Cost', 'Delivery'], ['SMS usage', 'Cost alerts', 'Delivery visibility', 'Verification health'], 'Messaging failures block users and cost spikes can arrive fast.'),
    op('SendGrid', 'Transactional email', 'Phase 1', ['Delivery', 'Bounces', 'Domain', 'API'], ['Deliverability stats', 'Bounce alerts', 'Domain status', 'API health'], 'Email failure is business failure. Users need delivery visibility.'),
    op('Postmark', 'Email delivery', 'Phase 1', ['Delivery', 'Bounces', 'DKIM', 'SPF'], ['Delivery rate', 'Bounce alerts', 'Domain checks', 'Account health'], 'Transactional email powers receipts, logins, and alerts.'),
  ]},
  { id: 'identity-data', icon: '🔐', title: 'Identity + Data Partners', subtitle: 'Identity providers and database platforms that support operations.', partners: [
    op('Auth0', 'Identity provider', 'Phase 2', ['Clients', 'MFA', 'Tenant', 'Actions'], ['Client inventory', 'MFA visibility', 'Tenant review', 'Configuration alerts'], 'Identity settings are critical and rarely reviewed often enough.'),
    op('MongoDB Atlas', 'Database provider', 'Phase 2', ['Clusters', 'Backups', 'Network', 'Connections'], ['Cluster health', 'Backup status', 'Network review', 'Connection visibility'], 'Database health should not be discovered only after an outage.'),
  ]},
  { id: 'ai-platforms', icon: '🤖', title: 'Model Operations Partners', subtitle: 'Model endpoints, AI workloads, spend, and usage signals.', partners: [
    op('Hugging Face', 'Models and endpoints', 'Phase 3', ['Models', 'Spaces', 'Endpoints', 'Access'], ['Endpoint health', 'Model usage', 'Access review', 'Space status'], 'Model operations should be understandable to non-technical owners.'),
    op('Replicate', 'Model runs', 'Phase 3', ['Runs', 'Spend', 'Models', 'Status'], ['Run status', 'Spend alerts', 'Model usage', 'Account health'], 'Model workloads can become expensive. Owners need early warning.'),
  ]},
  { id: 'ops-monitoring', icon: '🛠️', title: 'Operations Visibility Partners', subtitle: 'Error tracking, metrics, incidents, uptime, and escalation visibility.', partners: [
    op('Sentry', 'Errors and releases', 'Phase 2', ['Errors', 'Releases', 'Alerts', 'Projects'], ['Error summary', 'Release health', 'Alert visibility', 'Trend detection'], 'Errors should become recommended actions, not noise.'),
    op('Datadog', 'Metrics and logs', 'Phase 3', ['Monitors', 'Logs', 'Metrics', 'Incidents'], ['Monitor summary', 'Incident visibility', 'Log volume alerts', 'Usage checks'], 'Datadog is powerful but can overwhelm small teams.'),
    op('PagerDuty', 'Incident response', 'Phase 3', ['Incidents', 'Services', 'Escalation', 'On-call'], ['Incident summary', 'Service health', 'Escalation visibility', 'On-call status'], 'Incident tools connect alerts to people. They belong in Command Control.'),
    op('New Relic', 'APM and uptime', 'Phase 3', ['APM', 'Logs', 'Alerts', 'Uptime'], ['App health', 'Alert visibility', 'Uptime checks', 'Performance trends'], 'Performance data is most useful when translated into next actions.'),
  ]},
]

const allPartnerNames = PAGES.flatMap(page => page.partners.map(partner => partner.name))
function defaultPreferences(): Record<string, boolean> { return Object.fromEntries(allPartnerNames.map(name => [name, true])) }

export default function ProviderExpansionPage(_props: PageProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const [enabledPartners, setEnabledPartners] = useState<Record<string, boolean>>(defaultPreferences)
  const page = PAGES[pageIndex]

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY) || localStorage.getItem(oldPrefKey)
      if (raw) setEnabledPartners({ ...defaultPreferences(), ...JSON.parse(raw) })
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify(enabledPartners)) } catch {} }, [enabledPartners])

  const enabledCount = useMemo(() => Object.values(enabledPartners).filter(Boolean).length, [enabledPartners])
  const togglePartner = (name: string) => setEnabledPartners(prev => ({ ...prev, [name]: prev[name] === false }))
  const setPagePartners = (enabled: boolean) => setEnabledPartners(prev => { const next = { ...prev }; for (const partner of page.partners) next[partner.name] = enabled; return next })
  const cardColumns = page.partners.length >= 4 ? 'repeat(4, minmax(0, 1fr))' : page.partners.length === 3 ? 'repeat(3, minmax(0, 1fr))' : page.partners.length === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)'

  return (
    <div className="partner-network" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      <style>{`.partner-chip,.partner-toggle,.partner-page-tab{white-space:nowrap}.partner-card.is-disabled{opacity:.48;filter:saturate(.65)}.partner-signal{min-height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(135deg,rgba(26,240,255,.10),rgba(255,195,0,.06));display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:11.5px;font-weight:900;color:rgba(255,255,255,.78)}@media(max-width:1180px){.partner-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.partner-page-tabs{max-height:112px;overflow-y:auto}}@media(max-width:760px){.partner-grid{grid-template-columns:1fr!important}.partner-card{min-height:auto!important}}`}</style>

      <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>Operations & Production</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>Business Operating Partners</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 900 }}>These partners support daily operations. The Command Center informs and recommends; company management owns final decisions.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', fontSize: 12.5, fontWeight: 900 }}>{enabledCount} enabled</span>
          <span style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${TONES.gold.border}`, background: TONES.gold.soft, color: '#ffc300', fontSize: 12.5, fontWeight: 900 }}>{pageIndex + 1} / {PAGES.length}</span>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div><div style={{ fontSize: 16, fontWeight: 950 }}>Partner Network Control</div><div style={{ color: 'rgba(255,255,255,.52)', fontSize: 12.5, marginTop: 2 }}>Enable only the operating partners used by this business function.</div></div>
          <div style={{ color: 'rgba(255,255,255,.52)', fontSize: 12.5 }}>{enabledCount} of {allPartnerNames.length} active</div>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{allPartnerNames.map(name => { const enabled = enabledPartners[name] !== false; return <button key={name} onClick={() => togglePartner(name)} className="hub-chip partner-chip" style={{ padding: '6px 9px', borderRadius: 999, border: enabled ? '1px solid rgba(34,197,94,.38)' : '1px solid rgba(255,255,255,.14)', background: enabled ? 'rgba(34,197,94,.10)' : 'rgba(255,255,255,.045)', color: enabled ? '#86efac' : 'rgba(255,255,255,.52)', fontSize: 11.5, fontWeight: 900 }}>{enabled ? '●' : '○'} {name}</button> })}</div>
      </section>

      <section style={{ ...cardStyle, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(255,195,0,.12), rgba(26,240,255,.06), rgba(3,7,18,0))', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><div style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.02em' }}>{page.icon} {page.title}</div><div style={{ color: 'rgba(255,255,255,.58)', fontSize: 13.5, marginTop: 5 }}>{page.subtitle}</div></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button onClick={() => setPageIndex(Math.max(0, pageIndex - 1))} disabled={pageIndex === 0} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.045)', color: pageIndex === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.72)', fontSize: 12, fontWeight: 900 }}>Previous</button><button onClick={() => setPageIndex(Math.min(PAGES.length - 1, pageIndex + 1))} disabled={pageIndex === PAGES.length - 1} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: `1px solid ${TONES.blue.border}`, background: TONES.blue.soft, color: pageIndex === PAGES.length - 1 ? 'rgba(255,255,255,.32)' : '#1af0ff', fontSize: 12, fontWeight: 900 }}>Next</button><button onClick={() => setPagePartners(true)} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(34,197,94,.38)', background: 'rgba(34,197,94,.08)', color: '#86efac', fontSize: 12, fontWeight: 900 }}>Enable page</button><button onClick={() => setPagePartners(false)} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.045)', color: 'rgba(255,255,255,.68)', fontSize: 12, fontWeight: 900 }}>Disable page</button></div>
        </div>
        <div className="partner-page-tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '11px 13px', borderTop: '1px solid rgba(255,255,255,.08)' }}>{PAGES.map((item, index) => <button key={item.id} onClick={() => setPageIndex(index)} className="hub-chip partner-page-tab" style={{ padding: '7px 9px', borderRadius: 11, border: pageIndex === index ? `1px solid ${TONES.gold.border}` : '1px solid rgba(255,255,255,.12)', background: pageIndex === index ? TONES.gold.soft : 'rgba(255,255,255,.04)', color: pageIndex === index ? '#ffc300' : 'rgba(255,255,255,.68)', fontSize: 11.5, fontWeight: 900 }}>{item.icon} {index + 1}</button>)}</div>
      </section>

      <main className="hub-panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 8 }}>
        <div className="partner-grid" style={{ display: 'grid', gridTemplateColumns: cardColumns, gap: 14, alignItems: 'stretch' }}>
          {page.partners.map(partner => { const enabled = enabledPartners[partner.name] !== false; return <article key={partner.name} className={`partner-card ${enabled ? '' : 'is-disabled'}`} style={{ ...cardStyle, padding: 15, minHeight: page.partners.length >= 4 ? 285 : 330, display: 'flex', flexDirection: 'column', gap: 11 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}><div><div style={{ ...labelStyle, color: enabled ? '#ffc300' : 'rgba(255,255,255,.45)' }}>{partner.phase}</div><h3 style={{ margin: '3px 0 0', fontSize: 20, letterSpacing: '-.025em' }}>{partner.name}</h3><div style={{ color: 'rgba(255,255,255,.54)', fontSize: 12.5 }}>{partner.subtitle}</div></div><button onClick={() => togglePartner(partner.name)} className="hub-chip partner-toggle" style={{ padding: '6px 9px', borderRadius: 999, border: '1px solid rgba(26,240,255,.3)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', fontSize: 11.5, fontWeight: 900 }}>{enabled ? 'On' : 'Off'}</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>{partner.visual.map(item => <div key={item} className="partner-signal">{item}</div>)}</div><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{partner.monitor.slice(0, 4).map(item => <div key={item} style={{ padding: '7px 9px', borderRadius: 12, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.035)', color: 'rgba(255,255,255,.72)', fontSize: 12, fontWeight: 750 }}>{item}</div>)}</div><p style={{ margin: 'auto 0 0', color: 'rgba(255,255,255,.58)', lineHeight: 1.42, fontSize: 12.5 }}>{partner.why}</p></article> })}
        </div>
      </main>
    </div>
  )
}
