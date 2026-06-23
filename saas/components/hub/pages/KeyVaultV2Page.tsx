'use client'

// saas/components/hub/pages/KeyVaultV2Page.tsx
// Vault v2 Wave 1 (W1) — Read-only unlocked view with secrets grid and audit log.

import { useState, useMemo, useEffect } from 'react'
import { UnlockScreen, VaultSecretsGrid, VaultAuditLog, ProviderSelect } from '../vault'
import { VaultSecret, VaultExpirationAlert, VaultAuditLog as VaultAuditLogType, VaultStats } from '@/lib/hub/vault-types'
import { getVaultSecrets, getVaultAuditLog, getVaultStats } from '@/lib/hub/vault-operations'
import { notifyBoth } from '@/lib/hub/vault-notifications'
import { PageProps, cardStyle, labelStyle } from '../shared'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

// Mock data for W1 (read-only demo) — REMOVE AFTER TESTING
// For now, use empty defaults and fetch from Supabase

const MOCK_ALERTS: VaultExpirationAlert[] = []
const MOCK_AUDIT_LOGS: VaultAuditLogType[] = []
const MOCK_STATS: VaultStats = {
  total_secrets: 0,
  active_secrets: 0,
  expiring_soon: 0,
  expired: 0,
  last_rotation: new Date().toISOString(),
  next_rotation: new Date().toISOString(),
}

export default function KeyVaultV2Page({ lang }: PageProps) {
  const { dict } = useI18n()
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedSecret, setSelectedSecret] = useState<VaultSecret | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedProviderName, setSelectedProviderName] = useState<string | null>(null)
  
  // Real data from Supabase
  const [secrets, setSecrets] = useState<VaultSecret[]>([])
  const [auditLogs, setAuditLogs] = useState<VaultAuditLogType[]>([])
  const [stats, setStats] = useState<VaultStats>(MOCK_STATS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnlock = (sid: string) => {
    setSessionId(sid)
    setIsUnlocked(true)
    // Fetch real data when unlocked
    fetchVaultData()
  }

  const fetchVaultData = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Fetch secrets
      const secretsResult = await getVaultSecrets()
      if (secretsResult.ok && secretsResult.secrets) {
        setSecrets(secretsResult.secrets)
      } else {
        setError(secretsResult.error || t(dict, 'console.vault.err.fetch', 'Failed to fetch secrets'))
      }
      
      // Fetch audit log
      const logsResult = await getVaultAuditLog()
      if (logsResult.ok && logsResult.logs) {
        setAuditLogs(logsResult.logs)
      }
      
      // Fetch stats
      const statsResult = await getVaultStats()
      if (statsResult.ok && statsResult.stats) {
        setStats(statsResult.stats)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t(dict, 'console.vault.err.unknown', 'Unknown error')
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleProviderSelect = (providerId: string, providerName: string) => {
    setSelectedProviderId(providerId)
    setSelectedProviderName(providerName)
  }

  const secretsByStatus = useMemo(() => {
    const groups: Record<string, VaultSecret[]> = {
      active: [],
      expiring_soon: [],
      expired: [],
      rotated: [],
      revoked: [],
    }
    
    // Filter by selected provider if one is chosen
    const filteredSecrets = selectedProviderId 
      ? secrets.filter(s => s.provider_id === selectedProviderId)
      : secrets
    
    filteredSecrets.forEach(s => {
      groups[s.status].push(s)
    })
    return groups
  }, [selectedProviderId, secrets])

  if (!isUnlocked) {
    return <UnlockScreen onUnlock={handleUnlock} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      {/* Header */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>{t(dict, 'console.vault.eyebrow', 'Operations & Production')}</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>{t(dict, 'console.vault.title', 'Keys & Secrets')}</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 840 }}>
            {t(dict, 'console.vault.subtitle', 'Credential inventory, expiration alerts, and rotation status.')} {MOCK_STATS.total_secrets} {MOCK_STATS.total_secrets === 1 ? t(dict, 'console.vault.secret', 'secret') : t(dict, 'console.vault.secrets', 'secrets')} {t(dict, 'console.vault.stored', 'stored.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11.5, fontWeight: 600, flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,.35)', background: 'rgba(34,197,94,.08)', color: '#86efac' }}>
            {MOCK_STATS.active_secrets} {t(dict, 'console.vault.active', 'Active')}
          </span>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,195,0,.35)', background: 'rgba(255,195,0,.08)', color: '#ffc300' }}>
            {MOCK_STATS.expiring_soon} {t(dict, 'console.vault.expiring', 'Expiring')}
          </span>
          <button
            onClick={() => setIsUnlocked(false)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,.15)',
              background: 'rgba(255,255,255,.04)',
              color: 'rgba(255,255,255,.6)',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t(dict, 'console.vault.lock', 'Lock Vault')}
          </button>
        </div>
      </section>

      {/* Main content */}
      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, paddingRight: 8 }}>
        {/* Provider selector */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...labelStyle }}>{t(dict, 'console.vault.browse', 'Browse Secrets')}</div>
          <div style={{ ...cardStyle, padding: 14 }}>
            <ProviderSelect onSelect={handleProviderSelect} selectedId={selectedProviderId} placeholder={t(dict, 'console.vault.searchProvider', 'Search and select a provider...')} />
            {selectedProviderName && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(26,240,255,.8)' }}>
                {t(dict, 'console.vault.selected', 'Selected:')} <strong>{selectedProviderName}</strong>
              </div>
            )}
          </div>
        </section>

        {/* Secrets by status */}
        {!selectedProviderId ? (
          <div style={{ padding: '24px 14px', borderRadius: 10, border: '1px dashed rgba(26,240,255,.2)', background: 'rgba(26,240,255,.04)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(26,240,255,.7)' }}>
              {t(dict, 'console.vault.selectPrompt', '👆 Select a provider above to view its secrets')}
            </p>
          </div>
        ) : Object.values(secretsByStatus).every(s => s.length === 0) ? (
          <div style={{ padding: '24px 14px', borderRadius: 10, border: '1px dashed rgba(255,195,0,.2)', background: 'rgba(255,195,0,.04)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,195,0,.7)' }}>
              {t(dict, 'console.vault.noSecretsFor', 'No secrets found for')} <strong>{selectedProviderName}</strong>
            </p>
          </div>
        ) : (
          Object.entries(secretsByStatus).map(([status, secrets]) => {
            if (secrets.length === 0) return null

          const statusLabels: Record<string, string> = {
            active: t(dict, 'console.vault.status.active', 'Active Secrets'),
            expiring_soon: t(dict, 'console.vault.status.expiringSoon', 'Expiring Soon'),
            expired: t(dict, 'console.vault.status.expired', 'Expired'),
            rotated: t(dict, 'console.vault.status.rotated', 'Recently Rotated'),
            revoked: t(dict, 'console.vault.status.revoked', 'Revoked'),
          }

          return (
            <section key={status}>
              <div style={{ ...labelStyle, marginBottom: 12 }}>
                {statusLabels[status]} — {secrets.length} {secrets.length === 1 ? t(dict, 'console.vault.secret', 'secret') : t(dict, 'console.vault.secrets', 'secrets')}
              </div>
              <VaultSecretsGrid secrets={secrets} alerts={[]} onSelectSecret={setSelectedSecret} />
            </section>
          )
        })
        )}

        {/* Audit log */}
        <section style={{ minHeight: '54vh' }}>
          <VaultAuditLog logs={auditLogs} />
        </section>
      </main>

      {/* Secret detail modal (if selected) */}
      {selectedSecret && (
        <div
          onClick={() => setSelectedSecret(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              ...cardStyle,
              maxWidth: 480,
              padding: 24,
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{selectedSecret.secret_name}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
                  {selectedSecret.provider_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedSecret(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  background: 'rgba(255,255,255,.05)',
                  color: 'rgba(255,255,255,.6)',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  {t(dict, 'console.vault.maskedValue', 'Masked Value')}
                </div>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.04)',
                    border: '1px solid rgba(255,255,255,.1)',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: 'rgba(255,255,255,.65)',
                  }}
                >
                  {selectedSecret.masked_value}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 10, color: 'rgba(255,255,255,.4)' }}>
                  {t(dict, 'console.vault.encryptedNote', 'Full value is encrypted and not displayed in the UI.')}
                </p>
              </div>

              {selectedSecret.expires_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                    {t(dict, 'console.vault.expiration', 'Expiration')}
                  </div>
                  <div style={{ fontSize: 13, color: '#fff' }}>
                    {new Date(selectedSecret.expires_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              )}

              {selectedSecret.last_rotated_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                    {t(dict, 'console.vault.lastRotated', 'Last Rotated')}
                  </div>
                  <div style={{ fontSize: 13, color: '#fff' }}>
                    {new Date(selectedSecret.last_rotated_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  {t(dict, 'console.vault.typeEnv', 'Type & Environment')}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(255,255,255,.08)',
                      color: 'rgba(255,255,255,.65)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {selectedSecret.secret_type.replace('_', ' ')}
                  </span>
                  {selectedSecret.environment && (
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: 'rgba(255,255,255,.08)',
                        color: 'rgba(255,255,255,.65)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {selectedSecret.environment}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
