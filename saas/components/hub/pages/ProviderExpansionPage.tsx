'use client'

// saas/components/hub/pages/ProviderExpansionPage.tsx
// Provider Manual — separated into 8 monitor pages so providers are not crowded.

import { useEffect, useMemo, useState } from 'react'
import { PageProps, TONES, cardStyle, labelStyle } from '../shared'

type ProviderIdea = {
  name: string
  subtitle: string
  visual: string[]
  automate: string[]
  why: string
  phase: 'Phase 1' | 'Phase 2' | 'Phase 3'
}

type ProviderPage = {
  id: string
  icon: string
  title: string
  subtitle: string
  providers: ProviderIdea[]
}

const PREF_KEY = 'signalboost:enabledProviders'

const PAGES: ProviderPage[] = [
  { id: 'p1', icon: '🧱', title: 'Monitor 1 — Core Cloud + AI', subtitle: 'High-value operating providers that should never be squeezed together.', providers: [
    { name: 'AWS', subtitle: 'Cloud operations', visual: ['IAM', 'S3', 'Compute', 'Alerts'], phase: 'Phase 1', automate: ['Access review reminders', 'Storage exposure checks', 'Unused credential reminders', 'Cloud health signals'], why: 'AWS is powerful but complex. SignalBoost should make the most important risks easy to understand.' },
    { name: 'OpenAI', subtitle: 'AI usage and cost', visual: ['Usage', 'Cost', 'Limits', 'Models'], phase: 'Phase 1', automate: ['Usage visibility', 'Cost spike alerts', 'Rate-limit alerts', 'Credential age reminders'], why: 'AI usage can become expensive quickly. Owners need a simple way to see cost and limits.' },
  ]},
  { id: 'p2', icon: '🚀', title: 'Monitor 2 — SignalBoost Platform Core', subtitle: 'The providers that power this SaaS platform.', providers: [
    { name: 'Supabase', subtitle: 'Database and auth', visual: ['Database', 'Auth', 'Storage', 'Coverage'], phase: 'Phase 1', automate: ['Database health', 'Auth status', 'Environment coverage', 'Storage policy review'], why: 'Supabase is core infrastructure. Data and auth status should always be visible.' },
    { name: 'Vercel', subtitle: 'Hosting and deploys', visual: ['Deploys', 'Builds', 'Domains', 'Env'], phase: 'Phase 1', automate: ['Deployment health', 'Environment comparison', 'Domain status', 'Failed build alerts'], why: 'Vercel is where the product lives. Deployment and environment drift must be easy to catch.' },
    { name: 'GitHub', subtitle: 'Code and releases', visual: ['Repos', 'PRs', 'Branches', 'Access'], phase: 'Phase 1', automate: ['Repository activity', 'Release visibility', 'Open PR summary', 'Access review guidance'], why: 'GitHub connects code, releases, and access. It belongs in the command center.' },
  ]},
  { id: 'p3', icon: '🏢', title: 'Monitor 3 — Enterprise Clouds', subtitle: 'Large cloud providers get their own room.', providers: [
    { name: 'Google Cloud', subtitle: 'Cloud accounts and apps', visual: ['Accounts', 'OAuth', 'Roles', 'Projects'], phase: 'Phase 2', automate: ['Account inventory', 'Role visibility', 'App review reminders', 'Environment mapping'], why: 'Google Cloud configuration can sprawl. SignalBoost should turn it into a clear checklist.' },
    { name: 'Azure', subtitle: 'Enterprise identity', visual: ['Apps', 'Certificates', 'Roles', 'Tenant'], phase: 'Phase 2', automate: ['App expiration reminders', 'Certificate checks', 'Role visibility', 'Configuration warnings'], why: 'Azure identity and app settings need calm, readable monitoring.' },
  ]},
  { id: 'p4', icon: '🌐', title: 'Monitor 4 — App, DNS + Edge', subtitle: 'App configuration, DNS, SSL, and edge settings.', providers: [
    { name: 'Firebase', subtitle: 'App backend', visual: ['Auth', 'Rules', 'Storage', 'Usage'], phase: 'Phase 1', automate: ['Auth configuration', 'Rules review', 'Storage status', 'Usage visibility'], why: 'Firebase grows quickly and configuration drift is easy to miss.' },
    { name: 'Cloudflare', subtitle: 'DNS and edge', visual: ['DNS', 'SSL', 'Workers', 'Proxy'], phase: 'Phase 1', automate: ['DNS health', 'SSL status', 'Worker status', 'Proxy review'], why: 'Cloudflare sits in front of everything. Small mistakes can affect the whole business.' },
  ]},
  { id: 'p5', icon: '✉️', title: 'Monitor 5 — Messaging + Email', subtitle: 'Customer communication providers need space.', providers: [
    { name: 'Twilio', subtitle: 'SMS and verification', visual: ['SMS', 'Verify', 'Cost', 'Delivery'], phase: 'Phase 1', automate: ['SMS usage', 'Cost alerts', 'Delivery visibility', 'Verification health'], why: 'Messaging failures block users and cost spikes can arrive fast.' },
    { name: 'SendGrid', subtitle: 'Transactional email', visual: ['Delivery', 'Bounces', 'Domain', 'API'], phase: 'Phase 1', automate: ['Deliverability stats', 'Bounce alerts', 'Domain status', 'API health'], why: 'Email failure is business failure. Users need delivery visibility.' },
    { name: 'Postmark', subtitle: 'Email delivery', visual: ['Delivery', 'Bounces', 'DKIM', 'SPF'], phase: 'Phase 1', automate: ['Delivery rate', 'Bounce alerts', 'Domain checks', 'Account health'], why: 'Transactional email powers receipts, logins, and alerts.' },
  ]},
  { id: 'p6', icon: '🗄️', title: 'Monitor 6 — Data, Identity + Infrastructure', subtitle: 'Database, identity, and simple infrastructure providers.', providers: [
    { name: 'MongoDB Atlas', subtitle: 'Database provider', visual: ['Clusters', 'Backups', 'Network', 'Connections'], phase: 'Phase 2', automate: ['Cluster health', 'Backup status', 'Network review', 'Connection visibility'], why: 'Database health should not be discovered only after an outage.' },
    { name: 'Auth0', subtitle: 'Identity provider', visual: ['Clients', 'MFA', 'Tenant', 'Actions'], phase: 'Phase 2', automate: ['Client inventory', 'MFA visibility', 'Tenant review', 'Configuration alerts'], why: 'Identity settings are critical and rarely reviewed often enough.' },
    { name: 'DigitalOcean', subtitle: 'Cloud infrastructure', visual: ['Droplets', 'Spaces', 'Firewalls', 'Usage'], phase: 'Phase 1', automate: ['Droplet health', 'Storage usage', 'Firewall review', 'Account usage'], why: 'Small teams need cloud hygiene without a full DevOps department.' },
  ]},
  { id: 'p7', icon: '🧠', title: 'Monitor 7 — AI Provider Expansion', subtitle: 'AI providers have their own monitor page.', providers: [
    { name: 'Anthropic', subtitle: 'Claude API', visual: ['Usage', 'Cost', 'Limits', 'Access'], phase: 'Phase 2', automate: ['Usage visibility', 'Cost alerts', 'Limit warnings', 'Access review'], why: 'AI providers need cost and usage visibility just like cloud providers.' },
    { name: 'Hugging Face', subtitle: 'Models and endpoints', visual: ['Models', 'Spaces', 'Endpoints', 'Access'], phase: 'Phase 3', automate: ['Endpoint health', 'Model usage', 'Access review', 'Space status'], why: 'Model operations should be understandable to non-technical owners.' },
    { name: 'Replicate', subtitle: 'Model runs', visual: ['Runs', 'Spend', 'Models', 'Status'], phase: 'Phase 3', automate: ['Run status', 'Spend alerts', 'Model usage', 'Account health'], why: 'Model workloads can become expensive. Owners need early warning.' },
  ]},
  { id: 'p8', icon: '🛠️', title: 'Monitor 8 — Observability + Incident Ops', subtitle: 'Future incident command providers.', providers: [
    { name: 'Sentry', subtitle: 'Errors and releases', visual: ['Errors', 'Releases', 'Alerts', 'Projects'], phase: 'Phase 2', automate: ['Error summary', 'Release health', 'Alert visibility', 'Trend detection'], why: 'Errors should become recommended actions, not noise.' },
    { name: 'Datadog', subtitle: 'Metrics and logs', visual: ['Monitors', 'Logs', 'Metrics', 'Incidents'], phase: 'Phase 3', automate: ['Monitor summary', 'Incident visibility', 'Log volume alerts', 'Usage checks'], why: 'Datadog is powerful but can overwhelm small teams.' },
    { name: 'PagerDuty', subtitle: 'Incident response', visual: ['Incidents', 'Services', 'Escalation', 'On-call'], phase: 'Phase 3', automate: ['Incident summary', 'Service health', 'Escalation visibility', 'On-call status'], why: 'Incident tools connect alerts to people. They belong in Command Control.' },
    { name: 'New Relic', subtitle: 'APM and uptime', visual: ['APM', 'Logs', 'Alerts', 'Uptime'], phase: 'Phase 3', automate: ['App health', 'Alert visibility', 'Uptime checks', 'Performance trends'], why: 'Performance data is most useful when translated into next actions.' },
  ]},
]

const allProviderNames = PAGES.flatMap(page => page.providers.map(provider => provider.name))

function defaultPreferences(): Record<string, boolean> {
  return Object.fromEntries(allProviderNames.map(name => [name, true]))
}

export default function ProviderExpansionPage(_props: PageProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const [enabledProviders, setEnabledProviders] = useState<Record<string, boolean>>(defaultPreferences)
  const page = PAGES[pageIndex]

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      setEnabledProviders({ ...defaultPreferences(), ...parsed })
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(enabledProviders)) } catch {}
  }, [enabledProviders])

  const enabledCount = useMemo(() => Object.values(enabledProviders).filter(Boolean).length, [enabledProviders])

  const toggleProvider = (name: string) => {
    setEnabledProviders(prev => ({ ...prev, [name]: prev[name] === false }))
  }

  const setPageProviders = (enabled: boolean) => {
    setEnabledProviders(prev => {
      const next = { ...prev }
      for (const provider of page.providers) next[provider.name] = enabled
      return next
    })
  }

  const jumpTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="provider-playbook" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      <style>{`.provider-playbook-main{scroll-snap-type:y proximity}.provider-section{scroll-snap-align:start}.provider-section.is-disabled{opacity:.48;filter:saturate(.65)}.provider-visual{min-height:92px;border-radius:22px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(135deg,rgba(26,240,255,.11),rgba(255,195,0,.08),rgba(255,255,255,.035));display:flex;align-items:center;justify-content:center;text-align:center;padding:14px;font-size:12px;font-weight:900;color:rgba(255,255,255,.78)}.provider-down{width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font-size:21px;cursor:pointer;box-shadow:0 18px 50px rgba(0,0,0,.35)}.provider-down:hover{border-color:rgba(26,240,255,.55);color:#1af0ff}.provider-toggle{white-space:nowrap}.tier-tab{white-space:nowrap}.provider-pref-chip{white-space:nowrap}@media(max-width:780px){.provider-visual-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.provider-section{min-height:76vh!important}}`}</style>

      <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>Monitor 4</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>Provider Manual</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 850 }}>Providers are separated into {PAGES.length} readable monitor pages. No squeezing, no crowded grid.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', fontSize: 12.5, fontWeight: 900 }}>{enabledCount} enabled</span>
          <span style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${TONES.gold.border}`, background: TONES.gold.soft, color: '#ffc300', fontSize: 12.5, fontWeight: 900 }}>{pageIndex + 1} / {PAGES.length}</span>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 950 }}>Provider Preferences</div>
            <div style={{ color: 'rgba(255,255,255,.52)', fontSize: 12.5, marginTop: 2 }}>Turn providers on/off here without scrolling through the manual.</div>
          </div>
          <div style={{ color: 'rgba(255,255,255,.52)', fontSize: 12.5 }}>{enabledCount} of {allProviderNames.length} active</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {allProviderNames.map(name => {
            const enabled = enabledProviders[name] !== false
            return (
              <button key={name} onClick={() => toggleProvider(name)} className="hub-chip provider-pref-chip" style={{ padding: '7px 11px', borderRadius: 999, border: enabled ? '1px solid rgba(34,197,94,.38)' : '1px solid rgba(255,255,255,.14)', background: enabled ? 'rgba(34,197,94,.10)' : 'rgba(255,255,255,.045)', color: enabled ? '#86efac' : 'rgba(255,255,255,.52)', fontSize: 12, fontWeight: 900 }}>
                {enabled ? '●' : '○'} {name}
              </button>
            )
          })}
        </div>
      </section>

      <section style={{ ...cardStyle, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '15px 17px', background: 'linear-gradient(135deg, rgba(255,195,0,.12), rgba(26,240,255,.06), rgba(3,7,18,0))', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.02em' }}>{page.icon} {page.title}</div>
            <div style={{ color: 'rgba(255,255,255,.58)', fontSize: 13.5, marginTop: 5 }}>{page.subtitle}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setPageIndex(Math.max(0, pageIndex - 1))} disabled={pageIndex === 0} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.045)', color: pageIndex === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.72)', fontSize: 12, fontWeight: 900 }}>Previous</button>
            <button onClick={() => setPageIndex(Math.min(PAGES.length - 1, pageIndex + 1))} disabled={pageIndex === PAGES.length - 1} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: `1px solid ${TONES.blue.border}`, background: TONES.blue.soft, color: pageIndex === PAGES.length - 1 ? 'rgba(255,255,255,.32)' : '#1af0ff', fontSize: 12, fontWeight: 900 }}>Next</button>
            <button onClick={() => setPageProviders(true)} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(34,197,94,.38)', background: 'rgba(34,197,94,.08)', color: '#86efac', fontSize: 12, fontWeight: 900 }}>Enable page</button>
            <button onClick={() => setPageProviders(false)} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.045)', color: 'rgba(255,255,255,.68)', fontSize: 12, fontWeight: 900 }}>Disable page</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          {PAGES.map((item, index) => (
            <button key={item.id} onClick={() => setPageIndex(index)} className="hub-chip tier-tab" style={{ padding: '8px 10px', borderRadius: 12, border: pageIndex === index ? `1px solid ${TONES.gold.border}` : '1px solid rgba(255,255,255,.12)', background: pageIndex === index ? TONES.gold.soft : 'rgba(255,255,255,.04)', color: pageIndex === index ? '#ffc300' : 'rgba(255,255,255,.68)', fontSize: 12, fontWeight: 900 }}>
              {item.icon} {index + 1}
            </button>
          ))}
        </div>
      </section>

      <main className="provider-playbook-main hub-panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 8 }}>
        {page.providers.map((provider, index) => {
          const id = `${page.id}-${index}`
          const next = page.providers[index + 1]
          const enabled = enabledProviders[provider.name] !== false
          return (
            <section key={provider.name} id={id} className={`provider-section ${enabled ? '' : 'is-disabled'}`} style={{ minHeight: '72vh', padding: '22px 0 26px', borderBottom: index < page.providers.length - 1 ? '1px solid rgba(255,255,255,.12)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
                <div>
                  <div style={{ ...labelStyle, color: enabled ? '#ffc300' : 'rgba(255,255,255,.45)' }}>{provider.phase}</div>
                  <h3 style={{ margin: '4px 0 0', fontSize: 25, letterSpacing: '-.025em' }}>{provider.name} — {provider.subtitle}</h3>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ padding: '7px 11px', borderRadius: 999, border: enabled ? '1px solid rgba(34,197,94,.36)' : '1px solid rgba(255,255,255,.16)', background: enabled ? 'rgba(34,197,94,.10)' : 'rgba(255,255,255,.05)', color: enabled ? '#86efac' : 'rgba(255,255,255,.52)', fontSize: 12, fontWeight: 900 }}>{enabled ? 'Enabled' : 'Disabled'}</span>
                  <button onClick={() => toggleProvider(provider.name)} className="hub-chip provider-toggle" style={{ padding: '7px 11px', borderRadius: 999, border: '1px solid rgba(26,240,255,.3)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', fontSize: 12, fontWeight: 900 }}>{enabled ? 'Disable provider' : 'Enable provider'}</button>
                </div>
              </div>

              <div className="provider-visual-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 22 }}>
                {provider.visual.map(item => <div key={item} className="provider-visual">{item}</div>)}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, .58fr)', gap: 18, alignItems: 'start' }}>
                <div style={{ ...cardStyle, padding: 18 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 18 }}>What SignalBoost can monitor:</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,.74)', lineHeight: 1.8, fontSize: 13.5 }}>
                    {provider.automate.map(item => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div style={{ ...cardStyle, padding: 18, background: 'linear-gradient(135deg, rgba(255,195,0,.08), rgba(255,255,255,.035))' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: 18 }}>Why users care:</h4>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,.72)', lineHeight: 1.55, fontSize: 13.5 }}>{provider.why}</p>
                  {!enabled && <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,.48)', lineHeight: 1.45, fontSize: 12.5 }}>This provider is disabled for this browser. It can be enabled later if your team uses it.</p>}
                </div>
              </div>

              {next && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 18 }}><button className="provider-down" onClick={() => jumpTo(`${page.id}-${index + 1}`)} title={`Next: ${next.name}`}>↓</button></div>}
            </section>
          )
        })}
      </main>
    </div>
  )
}
