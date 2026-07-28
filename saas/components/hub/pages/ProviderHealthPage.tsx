// saas/components/hub/pages/ProviderHealthPage.tsx
'use client'

// saas/components/hub/pages/ProviderHealthPage.tsx
// Provider Health — split into smaller health monitor pages so providers are not cramped.

import { useMemo, useState } from 'react'
import { PageProps, TONES, cardStyle, labelStyle, rowStyle } from '../shared.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import { uiText } from '@/lib/i18n/uiText'

type Env = 'Production' | 'Staging' | 'Dev'
type HealthStatus = 'healthy' | 'degraded' | 'issues'
type Severity = 'Critical' | 'High' | 'Medium'
type IssueStatus = 'Open' | 'Acknowledged' | 'Resolved'

type ProviderHealth = { provider: string; icon: string; environment: Env; status: HealthStatus; signals: string[]; lastChecked: string }
type ProviderIssue = { id: string; severity: Severity; provider: string; environment: Env; type: string; summary: string; detected: string; status: IssueStatus; description: string; impact: string; fix: string; consoleUrl: string }
type HealthMonitor = { id: string; icon: string; title: string; subtitle: string; providers: string[] }

const environments: Env[] = ['Production', 'Staging', 'Dev']
const monitors: HealthMonitor[] = [
  { id: 'core-cloud', icon: '🧱', title: uiText('generatedUi.u_6f3bb271f99c88e4'), subtitle: uiText('generatedUi.u_3cbdd98910d55cbb'), providers: ['AWS', 'GCP', 'Azure'] },
  { id: 'app-edge', icon: '🌐', title: uiText('generatedUi.u_86d9a37e255b0626'), subtitle: uiText('generatedUi.u_3e17f50c5a7f2976'), providers: ['Cloudflare', 'Firebase'] },
  { id: 'identity-infra', icon: '🗄️', title: uiText('generatedUi.u_b54c9db013fdd7c6'), subtitle: uiText('generatedUi.u_d8b49e9c639115eb'), providers: ['Auth0', 'DigitalOcean'] },
]

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
  { id: 'aws-s3-public', severity: 'Critical', provider: 'AWS', environment: 'Production', type: 'Misconfiguration', summary: 'Public S3 bucket in production', detected: '2 min ago', status: "Open", description: uiText('generatedUi.u_b3e9d7e5a55543d4'), impact: 'Sensitive files may be accessible from the internet.', fix: 'Review bucket ACL and block public access unless public access is intentional.', consoleUrl: 'https://console.aws.amazon.com/s3/' },
  { id: 'aws-admin-key', severity: 'High', provider: 'AWS', environment: 'Production', type: 'Key issue', summary: 'IAM key has AdministratorAccess', detected: '4 min ago', status: "Open", description: uiText('generatedUi.u_e85c693d20cdbb08'), impact: 'If compromised, the key can control most AWS resources.', fix: 'Reduce privileges using least privilege and rotate the access key.', consoleUrl: 'https://console.aws.amazon.com/iam/' },
  { id: 'cf-origin-exposed', severity: 'High', provider: 'Cloudflare', environment: 'Production', type: 'Misconfiguration', summary: 'DNS record exposes origin IP', detected: '5 min ago', status: "Open", description: uiText('generatedUi.u_f40f9596d6181051'), impact: 'Attackers may bypass Cloudflare protections and target the origin directly.', fix: 'Enable proxy for the record or move the origin behind a protected endpoint.', consoleUrl: 'https://dash.cloudflare.com/' },
  { id: 'gcp-old-key', severity: 'Medium', provider: 'GCP', environment: 'Production', type: 'Key issue', summary: 'Service account key older than policy', detected: '11 min ago', status: "Acknowledged", description: uiText('generatedUi.u_d6fddbe80a00a6a6'), impact: 'Older keys increase the risk of credential leakage and stale permissions.', fix: 'Rotate the service account key and remove the old key.', consoleUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts' },
  { id: 'do-open-port', severity: 'Medium', provider: 'DigitalOcean', environment: 'Production', type: 'Misconfiguration', summary: 'Droplet open to 0.0.0.0/0 without firewall', detected: '14 min ago', status: "Open", description: uiText('generatedUi.u_7760757decb64927'), impact: 'Public services may be reachable by anyone on the internet.', fix: 'Attach a DigitalOcean firewall and restrict inbound traffic.', consoleUrl: 'https://cloud.digitalocean.com/networking/firewalls' },
]

const statusStyle: Record<HealthStatus, { label: string; color: string; bg: string; border: string }> = {
  healthy: { label: uiText('generatedUi.u_4a0b2f54b34f3d2a'), color: '#86efac', bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.35)' },
  degraded: { label: uiText('generatedUi.u_ee9f2e918c694384'), color: '#ffc300', bg: 'rgba(255,195,0,.11)', border: 'rgba(255,195,0,.38)' },
  issues: { label: uiText('generatedUi.u_c672325cf9fe629b'), color: '#fca5a5', bg: 'rgba(239,68,68,.11)', border: 'rgba(239,68,68,.38)' },
}

const severityStyle: Record<Severity, { color: string; bg: string; border: string }> = {
  Critical: { color: '#fca5a5', bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.45)' },
  High: { color: '#ffc300', bg: 'rgba(255,195,0,.11)', border: 'rgba(255,195,0,.42)' },
  Medium: { color: '#1af0ff', bg: 'rgba(26,240,255,.09)', border: 'rgba(26,240,255,.35)' },
}

export default function ProviderHealthPage(_props: PageProps) {
  const { dict } = useI18n()
  const [environment, setEnvironment] = useState<Env>('Production')
  const [monitorIndex, setMonitorIndex] = useState(0)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(issueRows[0]?.id || null)
  const monitor = monitors[monitorIndex]

  const filteredHealth = useMemo(() => healthRows.filter(row => row.environment === environment && monitor.providers.includes(row.provider)), [environment, monitor])
  const filteredIssues = useMemo(() => issueRows.filter(row => row.environment === environment && monitor.providers.includes(row.provider)), [environment, monitor])
  const selectedIssue = filteredIssues.find(issue => issue.id === selectedIssueId) || filteredIssues[0] || null
  const openCount = filteredIssues.filter(issue => issue.status === 'Open').length
  const criticalCount = filteredIssues.filter(issue => issue.severity === 'Critical').length

  return (
<div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 14 }}>
      <section style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>{t(dict, 'console.providerHealth.monitor')}</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>{t(dict, 'console.providerHealth.title')}</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 780 }}>{t(dict, 'console.providerHealth.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ padding: '7px 11px', borderRadius: 999, border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.12)', color: '#fca5a5', fontSize: 12.5, fontWeight: 900 }}>{criticalCount} {t(dict, 'console.providerHealth.critical')}</span>
          <span style={{ padding: '7px 11px', borderRadius: 999, border: `1px solid ${TONES.gold.border}`, background: TONES.gold.soft, color: '#ffc300', fontSize: 12.5, fontWeight: 900 }}>{openCount} {t(dict, 'console.providerHealth.open')}</span>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={labelStyle}>{t(dict, 'console.providerHealth.environment')}</span>
          {environments.map(env => <button key={env} onClick={() => setEnvironment(env)} className="hub-chip" style={{ padding: '7px 12px', borderRadius: 10, border: environment === env ? `1px solid ${TONES.gold.border}` : '1px solid rgba(255,255,255,.12)', background: environment === env ? TONES.gold.soft : 'rgba(255,255,255,.04)', color: environment === env ? '#ffc300' : 'rgba(255,255,255,.68)', fontSize: 12.5, fontWeight: 800 }}>{env}</button>)}
          <span style={{ ...labelStyle, marginLeft: 8 }}>{t(dict, 'console.providerHealth.monitor')}</span>
          {monitors.map((item, index) => <button key={item.id} onClick={() => setMonitorIndex(index)} className="hub-chip" style={{ padding: '7px 12px', borderRadius: 10, border: monitorIndex === index ? `1px solid ${TONES.blue.border}` : '1px solid rgba(255,255,255,.12)', background: monitorIndex === index ? TONES.blue.soft : 'rgba(255,255,255,.04)', color: monitorIndex === index ? '#1af0ff' : 'rgba(255,255,255,.68)', fontSize: 12.5, fontWeight: 800 }}>{item.icon} {index + 1}</button>)}
        </div>
      </section>

      <main className="hub-panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 8 }}>
        <section style={{ ...cardStyle, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 21, fontWeight: 950 }}>{monitor.icon} {monitor.title}</div>
          <div style={{ color: 'rgba(255,255,255,.56)', fontSize: 13, marginTop: 4 }}>{monitor.subtitle}</div>
        </section>

        <section style={{ marginBottom: 18 }}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>{t(dict, 'console.providerHealth.statusCards')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {filteredHealth.map(row => {
              const tone = statusStyle[row.status]
              return (
                <article key={`${row.provider}-${row.environment}`} className="hub-card" style={{ ...cardStyle, minHeight: 178 }}>
                  <div style={{ padding: '14px 15px 11px', borderBottom: `1px solid ${tone.border}`, background: `linear-gradient(135deg, ${tone.bg}, rgba(3,7,18,0))` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 950 }}>{row.icon} {row.provider}</div>
                        <div style={{ color: 'rgba(255,255,255,.52)', fontSize: 12.5 }}>{row.environment}</div>
                      </div>
                      <span style={{ padding: '5px 9px', borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, fontSize: 11.5, fontWeight: 900 }}>{tone.label}</span>
                    </div>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {row.signals.slice(0, 3).map(signal => <div key={signal} style={rowStyle}><span>{signal}</span></div>)}
                    <div style={{ color: 'rgba(255,255,255,.44)', fontSize: 12, marginTop: 4 }}>{t(dict, 'console.providerHealth.lastChecked')} {row.lastChecked}</div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(295px, .48fr)', gap: 14, alignItems: 'start' }}>
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '13px 15px', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.035)' }}>
              <div style={{ fontSize: 17, fontWeight: 950 }}>{t(dict, 'console.providerHealth.issues')}</div>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12.5, marginTop: 3 }}>{t(dict, 'console.providerHealth.issuesDesc')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredIssues.map(issue => {
                const severity = severityStyle[issue.severity]
                const active = selectedIssue?.id === issue.id
                return (
                  <button
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    style={{ display: 'grid', gridTemplateColumns: '90px 90px minmax(180px,1fr) 92px', gap: 10, alignItems: 'center', padding: '11px 13px', border: active ? '1px solid rgba(255,195,0,.38)' : '1px solid rgba(255,255,255,.06)', borderLeft: 'none', borderRight: 'none', background: active ? 'rgba(255,195,0,.08)' : 'rgba(255,255,255,.02)', color: '#fff', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <span style={{ padding: '4px 7px', borderRadius: 999, border: `1px solid ${severity.border}`, background: severity.bg, color: severity.color, fontSize: 11, fontWeight: 900 }}>{issue.severity}</span>
                    <span style={{ color: 'rgba(255,255,255,.76)', fontWeight: 800, fontSize: 12.5 }}>{issue.provider}</span>
                    <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 12.5 }}>{issue.summary}</span>
                    <span style={{ color: issue.status === 'Open' ? '#ffc300' : issue.status === 'Resolved' ? '#86efac' : '#1af0ff', fontSize: 12, fontWeight: 800 }}>{issue.status}</span>
                  </button>
                )
              })}
              {filteredIssues.length === 0 && <div style={{ padding: 18, color: 'rgba(255,255,255,.55)' }}>{t(dict, 'console.providerHealth.noAlerts')}</div>}
            </div>
          </div>

          <aside style={{ ...cardStyle, padding: 16, position: 'sticky', top: 0 }}>
            {selectedIssue ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={labelStyle}>{t(dict, 'console.providerHealth.alertDetail')}</div>
                  <h3 style={{ margin: '4px 0 0', fontSize: 18 }}>{selectedIssue.summary}</h3>
                </div>
                <div style={rowStyle}>
                  <strong>{t(dict, 'console.providerHealth.provider')}</strong>
                  <span>{selectedIssue.provider}</span>
                </div>
                <div style={rowStyle}>
                  <strong>{t(dict, 'console.providerHealth.severity')}</strong>
                  <span>{selectedIssue.severity}</span>
                </div>
                <div>
                  <div style={labelStyle}>{t(dict, 'console.providerHealth.impact')}</div>
                  <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>{selectedIssue.impact}</p>
                </div>
                <div>
                  <div style={labelStyle}>{t(dict, 'console.providerHealth.fix')}</div>
                  <p style={{ margin: '5px 0 0', color: 'rgba(255,255,255,.72)', lineHeight: 1.5 }}>{selectedIssue.fix}</p>
                </div>
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,.55)' }}>{t(dict, 'console.providerHealth.selectAlert')}</div>
            )}
          </aside>
        </section>
      </main>
    </div>
  )
}
