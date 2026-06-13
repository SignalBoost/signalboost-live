'use client'

// saas/components/hub/pages/ProviderExpansionPage.tsx
// Monitor 3 — Tiered Provider Automation Playbook.
// Providers are separated by tier so each one has room for automation value,
// business value, phase planning, and user enable/disable preference.

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

type TierPage = {
  id: string
  icon: string
  title: string
  subtitle: string
  providers: ProviderIdea[]
}

const PREF_KEY = 'signalboost:enabledProviders'

const TIERS: TierPage[] = [
  {
    id: 'tier-1',
    icon: '🧱',
    title: 'Tier 1 Providers — High-Value Automations',
    subtitle: 'Start here: cloud, AI, identity, cost, and security visibility with the strongest enterprise value.',
    providers: [
      { name: 'AWS', subtitle: 'IAM, S3, Lambda', visual: ['IAM keys', 'S3 access', 'Lambda status', 'Least privilege'], phase: 'Phase 1', automate: ['IAM key expiration monitoring', 'IAM key rotation reminders', 'S3 bucket access verification', 'Lambda function status + last deployment', 'Detect unused IAM keys', 'Show least-privilege warnings'], why: 'AWS is complex. Your console becomes a simple security dashboard.' },
      { name: 'OpenAI', subtitle: 'API keys, usage, cost', visual: ['Token usage', 'Cost spikes', 'Rate limits', 'Model status'], phase: 'Phase 1', automate: ['Usage monitoring for tokens and cost', 'Model availability status', 'Automatic alerts when hitting rate limits', 'Key age and rotation reminders', 'Cost spike detection'], why: 'OpenAI usage is expensive — visibility saves money.' },
      { name: 'Google Cloud', subtitle: 'Service accounts, OAuth', visual: ['Service accounts', 'OAuth clients', 'IAM roles', 'Key age'], phase: 'Phase 2', automate: ['Detect expiring service account keys', 'Show which roles each key has', 'OAuth client ID visibility', 'Alerts when a key is over-privileged', 'Environment mapping for service keys'], why: 'GCP service accounts are a nightmare to track manually.' },
      { name: 'Azure', subtitle: 'Enterprise identity', visual: ['App secrets', 'Certificates', 'Role assignments', 'Tenant config'], phase: 'Phase 2', automate: ['Azure AD app secret expiration', 'Certificate expiration', 'Role assignment visibility', 'Key rotation reminders', 'Misconfiguration warnings'], why: 'Azure is where enterprise identity risk hides.' },
    ],
  },
  {
    id: 'tier-2',
    icon: '⚙️',
    title: 'Tier 2 Providers — Practical Automations',
    subtitle: 'High-frequency operational providers: auth, messaging, email, DNS, and edge infrastructure.',
    providers: [
      { name: 'Firebase', subtitle: 'Auth, realtime DB', visual: ['Auth config', 'API usage', 'Token age', 'Rules health'], phase: 'Phase 1', automate: ['API key usage visibility', 'Auth domain configuration checks', 'Token expiration alerts', 'Misconfiguration warnings'], why: 'Firebase grows fast and security drift is easy to miss.' },
      { name: 'Twilio', subtitle: 'SMS, phone verification', visual: ['SMS usage', 'Cost alerts', 'Delivery rate', 'Verify health'], phase: 'Phase 1', automate: ['SMS usage monitoring', 'Cost alerts', 'Phone verification success rate', 'Key rotation reminders'], why: 'Messaging costs can spike quickly when nobody is watching.' },
      { name: 'SendGrid', subtitle: 'Transactional email', visual: ['Deliverability', 'Bounces', 'Domain auth', 'API keys'], phase: 'Phase 1', automate: ['Email deliverability stats', 'Bounce rate alerts', 'API key expiration', 'Domain authentication status'], why: 'Email failure is business failure. Users need visibility.' },
      { name: 'Cloudflare', subtitle: 'DNS, Workers, KV', visual: ['DNS health', 'Workers', 'SSL', 'KV usage'], phase: 'Phase 2', automate: ['DNS health checks', 'Worker script status', 'KV namespace usage', 'SSL expiration alerts', 'CAA and security record warnings'], why: 'Cloudflare sits in front of everything — small issues have big blast radius.' },
    ],
  },
  {
    id: 'tier-3',
    icon: '🧠',
    title: 'Tier 3 Providers — Data, Identity, Infrastructure',
    subtitle: 'Premium operations: databases, identity tenants, delivery providers, and cloud infrastructure hygiene.',
    providers: [
      { name: 'MongoDB Atlas', subtitle: 'Database provider', visual: ['Cluster health', 'Backups', 'IP whitelist', 'Connections'], phase: 'Phase 2', automate: ['Cluster health', 'Connection string visibility', 'IP whitelist monitoring', 'Backup status'], why: 'Database health is too important to discover after an outage.' },
      { name: 'Auth0', subtitle: 'Enterprise identity', visual: ['Client secrets', 'MFA', 'Tenant config', 'Rules/actions'], phase: 'Phase 2', automate: ['Client secret expiration', 'Tenant configuration checks', 'MFA enforcement visibility', 'Misconfiguration alerts'], why: 'Identity configuration is critical and rarely reviewed often enough.' },
      { name: 'DigitalOcean', subtitle: 'Droplets, spaces, firewalls', visual: ['Droplet health', 'Spaces usage', 'Firewall rules', 'Token age'], phase: 'Phase 1', automate: ['Droplet health', 'Spaces bucket usage', 'API token expiration', 'Firewall misconfigurations'], why: 'Small teams need cloud hygiene without a DevOps department.' },
      { name: 'Postmark', subtitle: 'Email delivery', visual: ['Delivery rate', 'Bounces', 'DKIM/SPF', 'API token'], phase: 'Phase 1', automate: ['Delivery rate', 'Bounce alerts', 'Domain DKIM/SPF status', 'Key rotation reminders'], why: 'Transactional email should be monitored like payment infrastructure.' },
    ],
  },
]

const allProviderNames = TIERS.flatMap(tier => tier.providers.map(provider => provider.name))

function defaultPreferences(): Record<string, boolean> {
  return Object.fromEntries(allProviderNames.map(name => [name, true]))
}

export default function ProviderExpansionPage(_props: PageProps) {
  const [tierIndex, setTierIndex] = useState(0)
  const [enabledProviders, setEnabledProviders] = useState<Record<string, boolean>>(defaultPreferences)
  const tier = TIERS[tierIndex]

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

  const setTierProviders = (enabled: boolean) => {
    setEnabledProviders(prev => {
      const next = { ...prev }
      for (const provider of tier.providers) next[provider.name] = enabled
      return next
    })
  }

  const jumpTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="provider-playbook" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      <style>{`.provider-playbook-main{scroll-snap-type:y proximity}.provider-section{scroll-snap-align:start}.provider-section.is-disabled{opacity:.48;filter:saturate(.65)}.provider-visual{min-height:92px;border-radius:22px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(135deg,rgba(26,240,255,.11),rgba(255,195,0,.08),rgba(255,255,255,.035));display:flex;align-items:center;justify-content:center;text-align:center;padding:14px;font-size:12px;font-weight:900;color:rgba(255,255,255,.78)}.provider-down{width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font-size:21px;cursor:pointer;box-shadow:0 18px 50px rgba(0,0,0,.35)}.provider-down:hover{border-color:rgba(26,240,255,.55);color:#1af0ff}.provider-toggle{white-space:nowrap}.tier-tab{white-space:nowrap}@media(max-width:780px){.provider-visual-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.provider-section{min-height:76vh!important}}`}</style>

      <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>Monitor 4</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>Provider Manual</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 850 }}>Enable the providers you use. Disable providers you do not have so health checks and alerts can stay focused.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(26,240,255,.35)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', fontSize: 12.5, fontWeight: 900 }}>{enabledCount} enabled</span>
          {TIERS.map((item, index) => (
            <button key={item.id} onClick={() => setTierIndex(index)} className="hub-chip tier-tab" style={{ padding: '8px 12px', borderRadius: 12, border: tierIndex === index ? `1px solid ${TONES.gold.border}` : '1px solid rgba(255,255,255,.12)', background: tierIndex === index ? TONES.gold.soft : 'rgba(255,255,255,.04)', color: tierIndex === index ? '#ffc300' : 'rgba(255,255,255,.68)', fontSize: 12.5, fontWeight: 900 }}>
              {item.icon} Tier {index + 1}
            </button>
          ))}
        </div>
      </section>

      <section style={{ ...cardStyle, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '15px 17px', background: 'linear-gradient(135deg, rgba(255,195,0,.12), rgba(26,240,255,.06), rgba(3,7,18,0))', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.02em' }}>{tier.icon} {tier.title}</div>
            <div style={{ color: 'rgba(255,255,255,.58)', fontSize: 13.5, marginTop: 5 }}>{tier.subtitle}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setTierProviders(true)} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(34,197,94,.38)', background: 'rgba(34,197,94,.08)', color: '#86efac', fontSize: 12, fontWeight: 900 }}>Enable tier</button>
            <button onClick={() => setTierProviders(false)} className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.045)', color: 'rgba(255,255,255,.68)', fontSize: 12, fontWeight: 900 }}>Disable tier</button>
          </div>
        </div>
      </section>

      <main className="provider-playbook-main hub-panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 8 }}>
        {tier.providers.map((provider, index) => {
          const id = `${tier.id}-${index}`
          const next = tier.providers[index + 1]
          const enabled = enabledProviders[provider.name] !== false
          return (
            <section key={provider.name} id={id} className={`provider-section ${enabled ? '' : 'is-disabled'}`} style={{ minHeight: '72vh', padding: '22px 0 26px', borderBottom: index < tier.providers.length - 1 ? '1px solid rgba(255,255,255,.12)' : 'none' }}>
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
                  <h4 style={{ margin: '0 0 12px', fontSize: 18 }}>What you can automate:</h4>
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,.74)', lineHeight: 1.8, fontSize: 13.5 }}>
                    {provider.automate.map(item => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div style={{ ...cardStyle, padding: 18, background: 'linear-gradient(135deg, rgba(255,195,0,.08), rgba(255,255,255,.035))' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: 18 }}>Why users love it:</h4>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,.72)', lineHeight: 1.55, fontSize: 13.5 }}>{provider.why}</p>
                  {!enabled && <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,.48)', lineHeight: 1.45, fontSize: 12.5 }}>This provider is disabled for this browser. It can be enabled later if your team uses it.</p>}
                </div>
              </div>

              {next && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 18 }}><button className="provider-down" onClick={() => jumpTo(`${tier.id}-${index + 1}`)} title={`Next: ${next.name}`}>↓</button></div>}
            </section>
          )
        })}
      </main>
    </div>
  )
}
