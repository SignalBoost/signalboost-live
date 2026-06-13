'use client'

// saas/components/hub/pages/ProviderExpansionPage.tsx
// Human-first Business Operating Partner console.
// Four tall cards per page. Status + actions. Operations first, monitoring second.

import { useEffect, useMemo, useState } from 'react'
import { PageProps, TONES, cardStyle, labelStyle } from '../shared'

type PartnerStatus = 'Healthy' | 'Needs Review' | 'Action Needed'
type PartnerAction = { label: string; kind: 'primary' | 'neutral'; url?: string }
type Partner = {
  name: string
  category: string
  subtitle: string
  status: PartnerStatus
  lastChecked: string
  region: string
  signals: string[]
  actions: PartnerAction[]
}

type PartnerPage = {
  id: string
  title: string
  subtitle: string
  partners: Partner[]
}

const PREF_KEY = 'signalboost:enabledOperatingPartners'
const oldPrefKey = 'signalboost:enabledProviders'

const action = (label: string, kind: PartnerAction['kind'] = 'neutral', url?: string): PartnerAction => ({ label, kind, url })
const partner = (name: string, category: string, subtitle: string, status: PartnerStatus, signals: string[], actions: PartnerAction[], region = 'global'): Partner => ({ name, category, subtitle, status, signals, actions, region, lastChecked: '1 min ago' })

const PAGES: PartnerPage[] = [
  {
    id: 'mission-critical',
    title: 'Mission Critical Partners',
    subtitle: 'Data, hosting, revenue, and source control. These keep Operations & Production alive.',
    partners: [
      partner('Supabase', 'Database', 'Backend, auth, users, storage', 'Healthy', ['Database healthy', 'Auth healthy', 'Storage healthy', 'API healthy'], [action('Open Supabase Dashboard', 'primary', 'https://supabase.com/dashboard'), action('Open Settings'), action('Run SQL'), action('Manage API Keys')], 'us-east-1'),
      partner('Vercel', 'Hosting', 'Frontend, deployments, domains', 'Healthy', ['Deployments healthy', 'Domains healthy', 'SSL healthy', 'Env vars covered'], [action('Open Vercel Dashboard', 'primary', 'https://vercel.com/dashboard'), action('Open Settings'), action('View Deployments'), action('Sync Project')]),
      partner('Stripe', 'Revenue', 'Payments, plans, billing', 'Healthy', ['Payments healthy', 'Plans configured', 'Webhooks healthy', 'Billing active'], [action('Open Stripe Dashboard', 'primary', 'https://dashboard.stripe.com/'), action('Open Settings'), action('Open Billing'), action('Check Webhooks')]),
      partner('GitHub', 'Source Control', 'Repos, releases, pull requests', 'Healthy', ['Repository healthy', 'Actions healthy', 'Issues tracked', 'PRs available'], [action('Open GitHub Dashboard', 'primary', 'https://github.com/SignalBoost/signalboost-live'), action('Open Repo'), action('Open Pull Requests'), action('Check Actions')]),
    ],
  },
  {
    id: 'growth-ai',
    title: 'Growth Partners — AI',
    subtitle: 'AI partners used by the operation for generation, support, automation, and analysis.',
    partners: [
      partner('OpenAI', 'AI', 'Models, usage, tokens, keys', 'Needs Review', ['Usage elevated', 'Keys active', 'Rate limits ok', 'Models available'], [action('Open OpenAI Dashboard', 'primary', 'https://platform.openai.com/'), action('View Usage'), action('Manage API Keys'), action('Check Limits')]),
      partner('Anthropic', 'AI', 'Claude API, usage, keys', 'Healthy', ['Usage normal', 'Keys active', 'Limits ok', 'Models available'], [action('Open Anthropic Console', 'primary', 'https://console.anthropic.com/'), action('View Usage'), action('Manage API Keys'), action('Check Limits')]),
      partner('Hugging Face', 'AI Models', 'Spaces, endpoints, models', 'Healthy', ['Endpoints healthy', 'Spaces active', 'Tokens active', 'Models available'], [action('Open Hugging Face', 'primary', 'https://huggingface.co/'), action('View Endpoints'), action('Manage Tokens'), action('Check Spaces')]),
      partner('Replicate', 'AI Models', 'Model runs, spend, keys', 'Healthy', ['Runs healthy', 'Spend normal', 'Keys active', 'Models available'], [action('Open Replicate', 'primary', 'https://replicate.com/'), action('View Runs'), action('Manage API Keys'), action('Check Spend')]),
    ],
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure Partners',
    subtitle: 'Cloud and infrastructure partners that support production workloads.',
    partners: [
      partner('AWS', 'Cloud', 'IAM, S3, compute, alerts', 'Action Needed', ['IAM warning', 'S3 review', 'Compute healthy', 'Keys need review'], [action('Open AWS Console', 'primary', 'https://console.aws.amazon.com/'), action('Review IAM'), action('Check S3'), action('Rotate Keys')], 'us-east-1'),
      partner('Google Cloud', 'Cloud', 'Projects, IAM, service accounts', 'Needs Review', ['Projects healthy', 'Old keys found', 'Roles need review', 'APIs healthy'], [action('Open GCP Console', 'primary', 'https://console.cloud.google.com/'), action('Review IAM'), action('Service Accounts'), action('Check APIs')]),
      partner('Azure', 'Cloud', 'Apps, tenant, certificates', 'Healthy', ['Apps healthy', 'Certificates healthy', 'Tenant healthy', 'Roles ok'], [action('Open Azure Portal', 'primary', 'https://portal.azure.com/'), action('Review Apps'), action('Check Certificates'), action('Review Roles')]),
      partner('DigitalOcean', 'Cloud', 'Droplets, spaces, firewalls', 'Needs Review', ['Droplets healthy', 'Firewall review', 'Spaces healthy', 'Usage normal'], [action('Open DigitalOcean', 'primary', 'https://cloud.digitalocean.com/'), action('Check Droplets'), action('Review Firewalls'), action('View Usage')]),
    ],
  },
  {
    id: 'edge-communication',
    title: 'Edge + Communication Partners',
    subtitle: 'DNS, edge, messaging, and transactional communication.',
    partners: [
      partner('Cloudflare', 'Edge/DNS', 'DNS, SSL, workers, proxy', 'Needs Review', ['DNS warning', 'SSL healthy', 'Proxy review', 'Workers healthy'], [action('Open Cloudflare', 'primary', 'https://dash.cloudflare.com/'), action('Open DNS'), action('Check SSL'), action('Review Proxy')]),
      partner('Twilio', 'Messaging', 'SMS, verify, phone', 'Healthy', ['SMS healthy', 'Verify healthy', 'Cost normal', 'Delivery healthy'], [action('Open Twilio', 'primary', 'https://console.twilio.com/'), action('View SMS'), action('Check Verify'), action('View Usage')]),
      partner('SendGrid', 'Email', 'Transactional email', 'Healthy', ['Delivery healthy', 'Bounces normal', 'Domain healthy', 'API active'], [action('Open SendGrid', 'primary', 'https://app.sendgrid.com/'), action('Check Delivery'), action('Review Bounces'), action('Domain Auth')]),
      partner('Postmark', 'Email', 'Transactional email', 'Healthy', ['Delivery healthy', 'Bounces normal', 'DKIM healthy', 'SPF healthy'], [action('Open Postmark', 'primary', 'https://account.postmarkapp.com/'), action('Check Delivery'), action('Review Bounces'), action('Domain Auth')]),
    ],
  },
  {
    id: 'identity-data',
    title: 'Identity + Data Partners',
    subtitle: 'Identity, authentication, app backend, and database partners.',
    partners: [
      partner('Auth0', 'Identity', 'Clients, MFA, tenant, actions', 'Needs Review', ['Client secret aging', 'MFA healthy', 'Tenant healthy', 'Actions healthy'], [action('Open Auth0', 'primary', 'https://manage.auth0.com/'), action('Review Clients'), action('Check MFA'), action('Rotate Secret')]),
      partner('Firebase', 'App Backend', 'Auth, rules, storage', 'Healthy', ['Auth healthy', 'Rules healthy', 'Storage healthy', 'Usage normal'], [action('Open Firebase', 'primary', 'https://console.firebase.google.com/'), action('Review Rules'), action('Check Auth'), action('View Usage')]),
      partner('MongoDB Atlas', 'Database', 'Clusters, backups, network', 'Healthy', ['Cluster healthy', 'Backups healthy', 'Network healthy', 'Connections normal'], [action('Open MongoDB Atlas', 'primary', 'https://cloud.mongodb.com/'), action('Check Clusters'), action('Review Backups'), action('Network Access')]),
      partner('Redis', 'Cache', 'Cache, sessions, queues', 'Healthy', ['Cache healthy', 'Memory ok', 'Connections ok', 'Latency normal'], [action('Open Redis Console', 'primary'), action('View Metrics'), action('Check Memory'), action('Review Access')]),
    ],
  },
  {
    id: 'ops-visibility',
    title: 'Operations Visibility Partners',
    subtitle: 'Errors, logs, incidents, uptime, and escalation visibility.',
    partners: [
      partner('Sentry', 'Errors', 'Errors, releases, alerts', 'Healthy', ['Errors normal', 'Releases healthy', 'Alerts healthy', 'Projects active'], [action('Open Sentry', 'primary', 'https://sentry.io/'), action('View Errors'), action('Check Releases'), action('Review Alerts')]),
      partner('Datadog', 'Observability', 'Metrics, logs, monitors', 'Healthy', ['Monitors healthy', 'Logs normal', 'Metrics healthy', 'Usage normal'], [action('Open Datadog', 'primary', 'https://app.datadoghq.com/'), action('View Monitors'), action('Check Logs'), action('View Usage')]),
      partner('PagerDuty', 'Incidents', 'Incidents, services, on-call', 'Healthy', ['Incidents clear', 'Services healthy', 'Escalation ok', 'On-call active'], [action('Open PagerDuty', 'primary', 'https://app.pagerduty.com/'), action('View Incidents'), action('Check Services'), action('On-call Schedule')]),
      partner('New Relic', 'APM', 'APM, logs, uptime', 'Healthy', ['APM healthy', 'Logs normal', 'Alerts healthy', 'Uptime healthy'], [action('Open New Relic', 'primary', 'https://one.newrelic.com/'), action('View APM'), action('Check Uptime'), action('Review Alerts')]),
    ],
  },
]

const allPartnerNames = PAGES.flatMap(page => page.partners.map(partner => partner.name))
function defaultPreferences(): Record<string, boolean> { return Object.fromEntries(allPartnerNames.map(name => [name, true])) }

const statusStyle: Record<PartnerStatus, { color: string; bg: string; border: string; dot: string }> = {
  Healthy: { color: '#86efac', bg: 'rgba(34,197,94,.11)', border: 'rgba(34,197,94,.38)', dot: '●' },
  'Needs Review': { color: '#ffc300', bg: 'rgba(255,195,0,.11)', border: 'rgba(255,195,0,.42)', dot: '●' },
  'Action Needed': { color: '#fca5a5', bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.42)', dot: '●' },
}

function openAction(item: PartnerAction) {
  if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
}

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

  return (
    <div className="partner-console" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      <style>{`.partner-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.partner-card{min-height:510px}.partner-action{width:100%;display:flex;align-items:center;justify-content:center;gap:8px}.partner-signal{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:12.5px}.partner-page-tab{white-space:nowrap}@media(max-width:1180px){.partner-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.partner-card{min-height:460px}}@media(max-width:760px){.partner-grid{grid-template-columns:1fr}.partner-card{min-height:auto}}`}</style>

      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>Operations & Production</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>Business Operating Partners</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 840 }}>Four partners per page. Clear status. Clear actions. The goal is to work from the console whenever possible.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', fontSize: 12.5, fontWeight: 900 }}>{enabledCount} enabled</span>
          <span style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${TONES.gold.border}`, background: TONES.gold.soft, color: '#ffc300', fontSize: 12.5, fontWeight: 900 }}>{pageIndex + 1} / {PAGES.length}</span>
        </div>
      </section>

      <section style={{ ...cardStyle, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(255,195,0,.12), rgba(26,240,255,.06), rgba(3,7,18,0))', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.02em' }}>{page.title}</div>
            <div style={{ color: 'rgba(255,255,255,.58)', fontSize: 13.5, marginTop: 5 }}>{page.subtitle}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setPageIndex(Math.max(0, pageIndex - 1))} disabled={pageIndex === 0} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.045)', color: pageIndex === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.72)', fontSize: 12, fontWeight: 900 }}>Previous</button>
            <button onClick={() => setPageIndex(Math.min(PAGES.length - 1, pageIndex + 1))} disabled={pageIndex === PAGES.length - 1} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: `1px solid ${TONES.blue.border}`, background: TONES.blue.soft, color: pageIndex === PAGES.length - 1 ? 'rgba(255,255,255,.32)' : '#1af0ff', fontSize: 12, fontWeight: 900 }}>Next</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '11px 13px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          {PAGES.map((item, index) => <button key={item.id} onClick={() => setPageIndex(index)} className="hub-chip partner-page-tab" style={{ padding: '7px 9px', borderRadius: 11, border: pageIndex === index ? `1px solid ${TONES.gold.border}` : '1px solid rgba(255,255,255,.12)', background: pageIndex === index ? TONES.gold.soft : 'rgba(255,255,255,.04)', color: pageIndex === index ? '#ffc300' : 'rgba(255,255,255,.68)', fontSize: 11.5, fontWeight: 900 }}>{index + 1}</button>)}
        </div>
      </section>

      <main className="hub-panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 8 }}>
        <div className="partner-grid">
          {page.partners.map(item => {
            const enabled = enabledPartners[item.name] !== false
            const tone = statusStyle[item.status]
            return (
              <article key={item.name} className="partner-card hub-card" style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 13, opacity: enabled ? 1 : .48 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ ...labelStyle, color: '#1af0ff' }}>{item.category}</div>
                    <h3 style={{ margin: '5px 0 3px', fontSize: 23, letterSpacing: '-.025em' }}>{item.name}</h3>
                    <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13 }}>{item.subtitle}</div>
                  </div>
                  <button onClick={() => togglePartner(item.name)} className="hub-chip" style={{ padding: '6px 9px', borderRadius: 999, border: '1px solid rgba(255,255,255,.13)', background: enabled ? 'rgba(34,197,94,.1)' : 'rgba(255,255,255,.045)', color: enabled ? '#86efac' : 'rgba(255,255,255,.55)', fontSize: 11.5, fontWeight: 900 }}>{enabled ? 'On' : 'Off'}</button>
                </div>

                <div style={{ padding: '11px 12px', borderRadius: 16, border: `1px solid ${tone.border}`, background: tone.bg }}>
                  <div style={{ ...labelStyle, color: 'rgba(255,255,255,.58)' }}>Status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: tone.color, fontSize: 15, fontWeight: 950 }}><span>{tone.dot}</span>{item.status}</div>
                  <div style={{ color: 'rgba(255,255,255,.48)', fontSize: 12, marginTop: 5 }}>Last checked: {item.lastChecked}</div>
                </div>

                <div>
                  <div style={{ ...labelStyle, marginBottom: 5 }}>Key Signals</div>
                  {item.signals.map(signal => <div key={signal} className="partner-signal"><span>{signal}</span><span style={{ color: '#86efac', fontWeight: 900 }}>Healthy</span></div>)}
                </div>

                <div style={{ marginTop: 'auto' }}>
                  <div style={{ ...labelStyle, marginBottom: 8 }}>Actions</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {item.actions.map((button, index) => <button key={button.label} onClick={() => openAction(button)} className="hub-chip partner-action" style={{ padding: '9px 10px', borderRadius: 11, border: button.kind === 'primary' ? '1px solid rgba(26,240,255,.42)' : '1px solid rgba(255,255,255,.13)', background: button.kind === 'primary' ? 'rgba(26,240,255,.12)' : 'rgba(255,255,255,.045)', color: button.kind === 'primary' ? '#1af0ff' : 'rgba(255,255,255,.78)', fontSize: 12.5, fontWeight: 900 }}>{index === 0 ? '↗' : '⚙'} {button.label}</button>)}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'rgba(255,255,255,.46)', fontSize: 11.5, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 10 }}><span>Region: {item.region}</span><span>Response: 110ms</span></div>
              </article>
            )
          })}
        </div>
      </main>
    </div>
  )
}
