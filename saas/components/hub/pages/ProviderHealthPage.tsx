'use client'

// saas/components/hub/pages/ProviderHealthPage.tsx
// Monitor — Provider Health, essential version.
// One screen answers: are critical providers healthy, broken, or risky?

import { useMemo, useState } from 'react'
import { PageProps, TONES, cardStyle, labelStyle, rowStyle } from '../shared'

type Env = 'Production' | 'Staging' | 'Dev'
type HealthStatus = 'healthy' | 'degraded' | 'issues'
type Severity = 'Critical' | 'High' | 'Medium'
type IssueStatus = 'Open' | 'Acknowledged' | 'Resolved'

type ProviderHealth = {
  provider: string
  icon: string
  environment: Env
  status: HealthStatus
  signals: string[]
  lastChecked: string
}

type ProviderIssue = {
  id: string
  severity: Severity
  provider: string
  environment: Env
  type: string
  summary: string
  detected: string
  status: IssueStatus
  description: string
  impact: string
  fix: string
  consoleUrl: string
}

const environments: Env[] = ['Production', 'Staging', 'Dev']
const allProviders = ['All', 'AWS', 'GCP', 'Azure', 'Cloudflare', 'Firebase', 'Auth0', 'DigitalOcean']

const healthRows: ProviderHealth[] = [
  { provider: 'AWS', icon: '🟧', environment: 'Production', status: 'issues', signals: ['IAM warning', 'S3 public risk', 'Unused keys found'], lastChecked: '2 min ago' },
  { provider: 'GCP', icon: '🟩', environment: 'Production', status: 'degraded', signals: ['Service accounts OK', 'Old keys found', 'Roles need review'], lastChecked: '3 min ago' },
  { provider: 'Azure', icon: '🟪', environment: 'Production', status: 'healthy', signals: ['App secrets OK', 'Certificates OK', 'No critical alerts'], lastChecked: '4 min ago' },
  { provider: 'Cloudflare', icon: '🟧', environment: 'Production', status: 'issues', signals: ['DNS warning', 'SSL OK', 'Origin exposed'], lastChecked: '2 min ago' },
  { provider: 'Firebase', icon: '🟨', environment: 'Production', status: 'healthy', signals: ['Rules OK', 'Storage OK', 'No public rules'], lastChecked: '5 min ago' },
  { provider: 'Auth0', icon: '🟫', environment: 'Production', status: 'healthy', signals: ['Secrets OK', 'Tenant OK', 'No alerts'], lastChecked: '7 min ago' },
  { provider: 'DigitalOcean', icon: '🟦', environment: 'Production', status: 'degraded', signals: ['Droplets OK', 'Firewall review', 'Open port found'], lastChecked: '6 min ago' },
  { provider: 'AWS', icon: '🟧', environment: 'Staging', status: 'healthy', signals: ['IAM OK', 'S3 OK', 'No critical alerts'], lastChecked: '8 min ago' },
  { provider: 'Cloudflare', icon: '🟧', environment: 'Dev', status: 'healthy', signals: ['DNS OK', 'SSL OK', 'No alerts'], lastChecked: '10 min ago' },
]

const issueRows: ProviderIssue[] = [
  { id: 'aws-s3-public', severity: 'Critical', provider: 'AWS', environment: 'Production', type: 'Misconfiguration', summary: 'Public S3 bucket in production', detected: '2 min ago', status: 'Open', description: 'A production S3 bucket appears to be publicly readable.', impact: 'Sensitive files may be accessible from the internet.', fix: 'Review bucket ACL and block public access unless public access is intentional.', consoleUrl: 'https://console.aws.amazon.com/s3/' },
  { id: 'aws-admin-key', severity: 'High', provider: 'AWS', environment: 'Production', type: 'Key issue', summary: 'IAM key has AdministratorAccess', detected: '4 min ago', status: 'Open', description: 'An IAM access key is attached to a principal with broad AdministratorAccess.', impact: 'If compromised, the key can control most AWS resources.', fix: 'Reduce privileges using least privilege and rotate the access key.', consoleUrl: 'https://console.aws.amazon.com/iam/' },
  { id: 'cf-origin-exposed', severity: 'High', provider: 'Cloudflare', environment: 'Production', type: 'Misconfiguration', summary: 'DNS record exposes origin IP', detected: '5 min ago', status: 'Open', description: 'A Cloudflare DNS record appears to have proxy disabled.', impact: 'Attackers may bypass Cloudflare protections and target the origin directly.', fix: 'Enable proxy for the record or move the origin behind a protected endpoint.', consoleUrl: 'https://dash.cloudflare.com/' },
  { id: 'gcp-old-key', severity: 'Medium', provider: 'GCP', environment: 'Production', type: 'Key issue', summary: 'Service account key older than policy', detected: '11 min ago', status: 'Acknowledged', description: 'A service account key is older than the allowed rotation window.', impact: 'Older keys increase the risk of credential leakage and stale permissions.', fix: 'Rotate the service account key and remove the old key.', consoleUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts' },
  { id: 'do-open-port', severity: 'Medium', provider: 'DigitalOcean', environment: 'Production', type: 'Misconfiguration', summary: 'Droplet open to 0.0.0.0/0 without firewall', detected: '14 min ago', status: 'Open', description: 'A droplet has public exposure without a matching firewall restriction.', impact: 'Public services may be reachable by anyone on the internet.', fix: 'Attach a DigitalOcean firewall and restrict inbound traffic.', consoleUrl: 'https://cloud.digitalocean.com/networking/firewalls' },
]

const statusStyle: Record<HealthStatus, { label: string; color: string; bg: string; border: string }> = {
  healthy: { label: '🟢 Healthy', color: '#86efac', bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.35)' },
  degraded: { label: '🟡 Degraded', color: '#ffc300', bg: 'rgba(255,195,0,.11)', border: 'rgba(255,195,0,.38)' },
  issues: { label: '🔴 Issues', color: '#fca5a5', bg: 'rgba(239,68,68,.11)', border: 'rgba(239,68,68,.38)' },
}

const severityStyle: Record<Severity, { color: string; bg: string; border: string }> = {
  Critical: { color: '#fca5a5', bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.45)' },
  High: { color: '#ffc300', bg: 'rgba(255,195,0,.11)', border: 'rgba(255,195,0,.42)' },
  Medium: { color: '#1af0ff', bg: 'rgba(26,240,255,.09)', border: 'rgba(26,240,255,.35)' },
}

export default function ProviderHealthPage(_props: PageProps) {
  const [environment, setEnvironment] = useState<Env>('Production')
  const [provider, setProvider] = useState('All')
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(issueRows[0]?.id || null)

  const filteredHealth = useMemo(() => healthRows.filter(row => row.environment === environment && (provider === 'All' || row.provider === provider)), [environment, provider])
  const filteredIssues = useMemo(() => issueRows.filter(row => row.environment === environment && (provider === 'All' || row.provider === provider)), [environment, provider])
  const selectedIssue = issueRows.find(issue => issue.id === selectedIssueId) || filteredIssues[0] || null

  const openCount = filteredIssues.filter(issue => issue.status === 'Open').length
  const criticalCount = filteredIssues.filter(issue => issue.severity === 'Critical').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 14 }}>
      <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>Monitor 3</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>Provider Health</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 780 }}>Essential view: are critical providers healthy, broken, or risky? No graphs, no noise.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ padding: '7px 11px', borderRadius: 999, border: `1px solid ${TONES.red.border}`, background: TONES.red.soft, color: '#fca5a5', fontSize: 12.5, fontWeight: 900 }}>{criticalCount} Critical</span>
          <span style={{ padding: '7px 11px', borderRadius: 999, border: `1px solid ${TONES.gold.border}`, background: TONES.gold.soft, color: '#ffc300', fontSize: 12.5, fontWeight: 900 }}>{openCount} Open</span>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={labelStyle}>Environment</span>
          {environments.map(env => (
            <button key={env} onClick={() => setEnvironment(env)} className="hub-chip" style={{ padding: '7px 12px', borderRadius: 10, border: environment === env ? `1px solid ${TONES.gold.border}` : '1px solid rgba(255,255,255,.12)', background: environment === env ? TONES.gold.soft : 'rgba(255,255,255,.04)', color: environment === env ? '#ffc300' : 'rgba(255,255,255,.68)', fontSize: 12.5, fontWeight: 800 }}>{env}</button>
          ))}
          <span style={{ ...labelStyle, marginLeft: 8 }}>Provider</span>
          {allProviders.map(item => (
            <button key={item} onClick={() => setProvider(item)} className="hub-chip" style={{ padding: '7px 12px', borderRadius: 10, border: provider === item ? `1px solid ${TONES.blue.border}` : '1px solid rgba(255,255,255,.12)', background: provider === item ? TONES.blue.soft : 'rgba(255,255,255,.04)', color: provider === item ? '#1af0ff' : 'rgba(255,255,255,.68)', fontSize: 12.5, fontWeight: 800 }}>{item}</button>
          ))}
        </div>
      </section>

      <main className="hub-panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 8 }}>
        <section style={{ marginBottom: 18 }}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>Provider Status Grid</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {filteredHealth.map(row => {
              const tone = statusStyle[row.status]
              return (
                <article key={`${row.provider}-${row.environment}`} className="hub-card" style={{ ...cardStyle, minHeight: 185 }} onClick={() => setProvider(row.provider)}>
                  <div style={{ padding: '14px 15px 11px', borderBottom: `1px solid ${tone.border}`, background: `linear-gradient(135deg, ${tone.bg}, rgba(3,7,18,0))` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div><div style={{ fontSize: 20, fontWeight: 950 }}>{row.icon} {row.provider}</div><div style={{ color: 'rgba(255,255,255,.52)', fontSize: 12.5 }}>{row.environment}</div></div>
                      <span style={{ padding: '5px 9px', borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 11.5, fontWeight: 900 }}>{tone.label}</span>
                    </div>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {row.signals.slice(0, 3).map(signal => <div key={signal} style={rowStyle}><span>{signal}</span></div>)}
                    <div style={{ color: 'rgba(255,255,255,.44)', fontSize: 12, marginTop: 4 }}>Last checked: {row.lastChecked}</div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(295px, .48fr)', gap: 14, alignItems: 'start' }}>
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '13px 15px', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.035)' }}>
              <div style={{ fontSize: 17, fontWeight: 950 }}>Issues & Alerts</div>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12.5, marginTop: 3 }}>Click a row to inspect impact and recommended fix.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredIssues.map(issue => {
                const severity = severityStyle[issue.severity]
                const active = selectedIssue?.id === issue.id
                return (
                  <button key={issue.id} onClick={() => setSelectedIssueId(issue.id)} style={{ display: 'grid', gridTemplateColumns: '90px 90px 120px minmax(180px,1fr) 92px 106px', gap: 10, alignItems: 'center', padding: '11px 13px', border: active ? '1px solid rgba(255,195,0,.38)' : '1px solid rgba(255,255,255,.06)', borderLeft: 'none', borderRight: 'none', background: active ? 'rgba(255,195,0,.08)' : 'rgba(255,255,255,.02)', color: '#fff', textAlign: 'left', cursor: 'pointer' }}>
                    <span style={{ padding: '4px 7px', borderRadius: 999, border: `1px solid ${severity.border}`, background: severity.bg, color: severity.color, fontSize: 11, fontWeight: 900 }}>{issue.severity}</span>
                    <span style={{ color: 'rgba(255,255,255,.76)', fontWeight: 800, fontSize: 12.5 }}>{issue.provider}</span>
                    <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 12 }}>{issue.type}</span>
                    <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 12.5 }}>{issue.summary}</span>
                    <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 12 }}>{issue.detected}</span>
                    <span style={{ color: issue.status === 'Open' ? '#ffc300' : issue.status === 'Resolved' ? '#86efac' : '#1af0ff', fontSize: 12, fontWeight: 800 }}>{issue.status}</span>
                  </button>
                )
              })}
              {filteredIssues.length === 0 && <div style={{ padding: 18, color: 'rgba(255,255,255,.55)' }}>No essential alerts for this filter.</div>}
            </div>
          </div>

          <aside style={{ ...cardStyle, padding: 16, position: 'sticky', top: 0 }}>
            {selectedIssue ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={labelStyle}>Alert detail</div>
                  <h3 style={{ margin: '4px 0 0', fontSize: 18 }}>{selectedIssue.summary}</h3>
                </div>
                <div style={rowStyle}><strong>Provider</strong><span>{selectedIssue.provider}</span></div>
                <div style={rowStyle}><strong>Severity</strong><span>{selectedIssue.severity}</span></div>
                <div><div style={labelStyle}>Description</div><p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>{selectedIssue.description}</p></div>
                <div><div style={labelStyle}>Impact</div><p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>{selectedIssue.impact}</p></div>
                <div><div style={labelStyle}>Recommended fix</div><p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>{selectedIssue.fix}</p></div>
                <a href={selectedIssue.consoleUrl} target="_blank" rel="noreferrer" className="hub-chip" style={{ alignSelf: 'flex-start', padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(26,240,255,.36)', background: 'rgba(26,240,255,.08)', color: '#1af0ff', textDecoration: 'none', fontSize: 12.5, fontWeight: 900 }}>Open in provider console</a>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.72)', fontSize: 12, fontWeight: 800 }}>Acknowledge</button>
                  <button className="hub-chip" style={{ padding: '7px 11px', borderRadius: 10, border: '1px solid rgba(34,197,94,.32)', background: 'rgba(34,197,94,.08)', color: '#86efac', fontSize: 12, fontWeight: 800 }}>Mark resolved</button>
                </div>
              </div>
            ) : <div style={{ color: 'rgba(255,255,255,.55)' }}>Select an alert to inspect details.</div>}
          </aside>
        </section>
      </main>
    </div>
  )
}
