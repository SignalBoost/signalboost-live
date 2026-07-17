import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { createBrowserProviderDiagnosticsSnapshot } from '@/lib/browser-provider/index'
import { loadLanguage } from '@/lib/i18n/loadLanguage'
import { getCurrentUser } from '@/utils/supabase/server'

function localize(dict: Record<string, unknown>, key: string): string {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[part]
  }, dict)
  return typeof value === 'string' ? value : key
}

function localizeToken(dict: Record<string, unknown>, namespace: string, value: string): string {
  return localize(dict, `${namespace}.${value}`)
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt style={muted}>{label}</dt><dd style={fieldValue}>{value}</dd></div>
}

export default async function SupervisorProviderDiagnosticsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const access = await getAccess()
  const cookieLocale = (await cookies()).get('sb_locale')?.value || 'en'
  const locale = ['en', 'es', 'pt', 'pl', 'ru'].includes(cookieLocale.slice(0, 2).toLowerCase())
    ? cookieLocale.slice(0, 2).toLowerCase()
    : 'en'
  const dict = await loadLanguage(locale)
  const tHa = dict.supervisorHa as Record<string, string>
  const tApproval = dict.supervisorApprovals as Record<string, string>
  const dictRecord = dict as Record<string, unknown>

  if (!access.isAdmin) {
    return <main style={page}><h1>{tHa.providerWorker}</h1><p>{tApproval.sessionNoLongerAvailable}</p></main>
  }

  const snapshot = createBrowserProviderDiagnosticsSnapshot()

  return (
    <main style={page}>
      <section style={panel}>
        <p style={kicker}><code>{snapshot.schemaVersion}</code></p>
        <h1>{tHa.providerWorker}</h1>
        <p style={warning}>{tHa.productionBrowserExecutionDisabled}</p>
        <div style={{ display: 'grid', gap: 18 }}>
          {snapshot.providers.map(provider => {
            const providerName = localize(dictRecord, provider.displayNameKey)
            const health = localize(dictRecord, `browserProvider.health.${provider.health.state}`)
            return (
              <article key={provider.providerId} style={card}>
                <div style={headerRow}>
                  <div>
                    <p style={kicker}>{tApproval.provider}</p>
                    <h2 style={{ margin: '4px 0' }}>{providerName}</h2>
                    <code>{provider.adapterVersion} · {provider.schemaVersion}</code>
                  </div>
                  <span style={badge}>{health}</span>
                </div>

                <dl style={grid}>
                  <Field label={tApproval.provider} value={provider.providerId} />
                  <Field label={tHa.executionMethod} value={localizeToken(dictRecord, 'browserProvider.risk', 'read_only')} />
                  <Field label={tHa.providerWorker} value={`${provider.worker.maximumConcurrentWork} · ${tHa.noActiveWork}`} />
                  <Field label={tApproval.approvalStatus} value={health} />
                </dl>

                <h3>{tApproval.targetOrigin}</h3>
                <ul>
                  {provider.origins.map(origin => (
                    <li key={origin.originId}>
                      <strong>{localize(dictRecord, origin.labelKey)}</strong>{' '}
                      <code>{origin.originId}</code> · <code>{origin.exactOrigin}</code>
                    </li>
                  ))}
                </ul>

                <div style={{ display: 'grid', gap: 14 }}>
                  {provider.capabilities.map(capability => (
                    <section key={capability.capabilityId} style={capabilityCard}>
                      <div style={headerRow}>
                        <div>
                          <h3 style={{ margin: 0 }}>{localize(dictRecord, capability.displayNameKey)}</h3>
                          {capability.descriptionKey ? <p style={muted}>{localize(dictRecord, capability.descriptionKey)}</p> : null}
                        </div>
                        <code>{capability.capabilityId}</code>
                      </div>
                      <dl style={grid}>
                        <Field label={tApproval.riskLevel} value={localizeToken(dictRecord, 'browserProvider.risk', capability.riskClass)} />
                        <Field label={tHa.capabilityMaturity} value={localizeToken(dictRecord, 'browserProvider.maturity', capability.maturity)} />
                        <Field label={tHa.executionMethod} value={Object.entries(capability.channels).filter(([, enabled]) => enabled).map(([channel]) => localizeToken(dictRecord, 'browserProvider.channel', channel)).join(' / ')} />
                        <Field label={tHa.policyVersion} value={capability.policyVersion} />
                        <Field label={tApproval.verificationRequirements} value={capability.verificationProfileId} />
                        <Field label={tApproval.evidence} value={capability.evidenceProfileId} />
                        <Field label={tApproval.targetOrigin} value={capability.allowedOriginIds.join(', ')} />
                        <Field label={tApproval.approvalStatus} value={localizeToken(dictRecord, 'browserProvider.boolean', String(capability.requiresHumanApproval))} />
                      </dl>
                      {capability.requiresHumanApproval ? <p style={warning}>{tHa.humanApprovalRequired}</p> : null}
                      <p style={warning}>{tHa.productionBrowserExecutionDisabled}</p>
                    </section>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#06111f,#05070c)' }
const panel = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)' }
const card = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 18, background: 'rgba(0,0,0,.24)' }
const capabilityCard = { border: '1px solid rgba(255,255,255,.10)', borderRadius: 14, padding: 14, background: 'rgba(255,255,255,.04)' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }
const headerRow = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-start' }
const muted = { color: 'rgba(255,255,255,.68)' }
const fieldValue = { margin: 0, wordBreak: 'break-word' as const }
const kicker = { color: '#1af0ff', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1 }
const badge = { border: '1px solid rgba(26,240,255,.35)', borderRadius: 999, padding: '6px 10px', color: '#1af0ff' }
const warning = { color: '#ffc300', fontWeight: 700 }
