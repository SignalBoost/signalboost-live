// saas/components/hub/pages/VaultV2Page.tsx
'use client'

// saas/components/hub/pages/KeyVaultV2Page.tsx
// Vault v2 Wave 1 (W1) — Read-only unlocked view with secrets grid and audit log.

import { useState, useMemo } from 'react'
import { UnlockScreen, VaultSecretsGrid, VaultAuditLog, ProviderSelect } from '../vault/index.ts'
import { VaultSecret, VaultExpirationAlert, VaultAuditLog as VaultAuditLogType, VaultStats } from '@/lib/hub/vault-types'
import { notifyBoth } from '@/lib/hub/vault-notifications'
import { PageProps, cardStyle, labelStyle } from '../shared.tsx'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


// Mock data for W1 (read-only demo)
const MOCK_SECRETS: VaultSecret[] = [
  {
    id: '1',
    provider_id: 'stripe',
    provider_name: 'Stripe',
    secret_type: 'api_key',
    secret_name: 'sk_live_prod',
    masked_value: 'sk_live_4J3****Xx2',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-06-10T14:30:00Z',
    expires_at: undefined,
    last_rotated_at: '2024-05-01T09:00:00Z',
    last_accessed_at: '2024-06-13T08:45:00Z',
    status: 'active',
    tags: ['production', 'billing'],
    environment: 'production',
  },
  {
    id: '2',
    provider_id: 'supabase',
    provider_name: 'Supabase',
    secret_type: 'api_key',
    secret_name: 'service_key',
    masked_value: 'eyJhbGciOiJI****YXJ0aWZhY3Q',
    created_at: '2024-02-20T10:00:00Z',
    updated_at: '2024-06-05T12:00:00Z',
    expires_at: '2025-02-20T10:00:00Z',
    last_rotated_at: '2024-02-20T10:00:00Z',
    last_accessed_at: '2024-06-13T09:30:00Z',
    status: 'active',
    tags: ['database', 'production'],
    environment: 'production',
  },
  {
    id: '3',
    provider_id: 'vercel',
    provider_name: 'Vercel',
    secret_type: 'token',
    secret_name: 'vc_deploy_token',
    masked_value: 'vercel_****mK2t',
    created_at: '2024-03-10T10:00:00Z',
    updated_at: '2024-06-01T11:00:00Z',
    expires_at: '2024-09-10T10:00:00Z',
    last_rotated_at: null,
    last_accessed_at: '2024-06-13T06:00:00Z',
    status: 'expiring_soon',
    tags: ['deployments', 'production'],
    environment: 'production',
  },
  {
    id: '4',
    provider_id: 'github',
    provider_name: 'GitHub',
    secret_type: 'token',
    secret_name: 'github_pat',
    masked_value: 'ghp_****KqL9',
    created_at: '2024-04-05T10:00:00Z',
    updated_at: '2024-06-01T10:00:00Z',
    expires_at: '2025-04-05T10:00:00Z',
    last_rotated_at: '2024-06-01T10:00:00Z',
    last_accessed_at: '2024-06-13T07:15:00Z',
    status: 'active',
    tags: ['ci-cd', 'repos'],
    environment: 'production',
  },
]

const MOCK_ALERTS: VaultExpirationAlert[] = [
  {
    id: '1',
    secret_id: '3',
    days_until_expiry: 88,
    severity: 'warning',
    notified_at: '2024-06-01T10:00:00Z',
    dismissed_at: null,
  },
]

const MOCK_AUDIT_LOGS: VaultAuditLogType[] = [
  {
    id: '1',
    secret_id: '1',
    action: 'accessed',
    user_id: 'user-1',
    user_email: 'luis@signalboost.com',
    timestamp: '2024-06-13T08:45:00Z',
    ip_address: '192.168.1.1',
    status: 'success',
    message: String(uiCopy('u_a0a6742eaa75fde0')),
  },
  {
    id: '2',
    secret_id: '4',
    action: 'rotated',
    user_id: 'user-1',
    user_email: 'luis@signalboost.com',
    timestamp: '2024-06-01T10:00:00Z',
    ip_address: '192.168.1.1',
    status: 'success',
    message: String(uiCopy('u_12f4a38abbcffe64')),
  },
  {
    id: '3',
    secret_id: '2',
    action: 'accessed',
    user_id: 'user-1',
    user_email: 'luis@signalboost.com',
    timestamp: '2024-06-13T09:30:00Z',
    ip_address: '192.168.1.1',
    status: 'success',
    message: String(uiCopy('u_7075d71f0c3672a2')),
  },
  {
    id: '4',
    secret_id: '3',
    action: 'created',
    user_id: 'user-1',
    user_email: 'luis@signalboost.com',
    timestamp: '2024-03-10T10:00:00Z',
    ip_address: '192.168.1.1',
    status: 'success',
    message: String(uiCopy('u_93c948bec025f094')),
  },
]

const MOCK_STATS: VaultStats = {
  total_secrets: 4,
  active_secrets: 3,
  expiring_soon: 1,
  expired: 0,
  last_rotation: '2024-06-01T10:00:00Z',
  next_rotation: '2024-07-01T10:00:00Z',
}

export default function KeyVaultV2Page({ lang }: PageProps) {
  const { t } = useTranslation()
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedSecret, setSelectedSecret] = useState<VaultSecret | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedProviderName, setSelectedProviderName] = useState<string | null>(null)

  const handleUnlock = (sid: string) => {
    setSessionId(sid)
    setIsUnlocked(true)
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
    MOCK_SECRETS.forEach(s => {
      groups[s.status].push(s)
    })
    return groups
  }, [])

  if (!isUnlocked) {
    return <UnlockScreen onUnlock={handleUnlock} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      {/* Header */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>{t('console.vaultx.page.ops', uiCopy('u_89cfe2933e6684e6'))}</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>{t('console.vaultx.page.keysSecrets', uiCopy('u_274194323027a634'))}</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 840 }}>
            {t('console.vaultx.page.inventory', uiCopy('u_43de3cdeec51d514'))} {MOCK_STATS.total_secrets} {MOCK_STATS.total_secrets === 1 ? t('console.vaultx.page.secretWord', uiCopy('u_7b1d737d789e28d0')) : t('console.vaultx.page.secretsWord', uiCopy('u_6a7b4db0d8ce84d6'))} {t('console.vaultx.page.stored', uiCopy('u_e8ec10fcc95e2a55'))}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11.5, fontWeight: 600, flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,.35)', background: 'rgba(34,197,94,.08)', color: '#86efac' }}>
            {MOCK_STATS.active_secrets} {t('console.vaultx.page.active', uiCopy('u_d3c1e85be71cb8a1'))}
          </span>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,195,0,.35)', background: 'rgba(255,195,0,.08)', color: '#ffc300' }}>
            {MOCK_STATS.expiring_soon} {t('console.vaultx.page.expiring', uiCopy('u_cd0f99c3b6c0e6f5'))}
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
            {t('console.vaultx.page.lockVault', uiCopy('u_863d49a57aa3e3d8'))}
          </button>
        </div>
      </section>
{/* Main content */}
      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, paddingRight: 8 }}>
        {/* Provider selector */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...labelStyle }}>{t('console.vaultx.page.browseSecrets', uiCopy('u_7e3dc5f3fd61b863'))}</div>
          <div style={{ ...cardStyle, padding: 14 }}>
            <ProviderSelect onSelect={handleProviderSelect} selectedId={selectedProviderId} placeholder={t('console.vaultx.page.providerPlaceholder', uiCopy('u_d5547091784e5c2b'))} />
            {selectedProviderName && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(26,240,255,.8)' }}>
                {t('console.vaultx.page.selected', uiCopy('u_7410aff51c9451f8'))} <strong>{selectedProviderName}</strong>
              </div>
            )}
          </div>
        </section>

        {/* Secrets by status */}
        {Object.entries(secretsByStatus).map(([status, secrets]) => {
          if (secrets.length === 0) return null

          const statusLabels: Record<string, string> = {
            active: t(uiCopy('u_c3df501cb8cb14be'), uiCopy('u_f303fdb4839b261a')),
            expiring_soon: t(uiCopy('u_4b4e2efa9b829307'), uiCopy('u_f745e41c99640528')),
            expired: t(uiCopy('u_a49bea69ba65d31d'), uiCopy('u_9e9a6aa960f26c14')),
            rotated: t(uiCopy('u_c40c0c63ed6a0c5e'), uiCopy('u_485ec1dd0e2baa8f')),
            revoked: t(uiCopy('u_c3414a608041e544'), uiCopy('u_92ec999d4076bac7')),
          }

          return (
            <section key={status}>
              <div style={{ ...labelStyle, marginBottom: 12 }}>
                {statusLabels[status]} — {secrets.length} {secrets.length === 1 ? t('console.vaultx.page.secretWord', uiCopy('u_608592f60025a6c0')) : t('console.vaultx.page.secretsWord', uiCopy('u_f6a562672012a2ef'))}
              </div>
              <VaultSecretsGrid secrets={secrets} alerts={MOCK_ALERTS} onSelectSecret={setSelectedSecret} />
            </section>
          )
        })}

        {/* Audit log */}
        <section style={{ minHeight: '54vh' }}>
          <VaultAuditLog logs={MOCK_AUDIT_LOGS} />
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
                  {t('console.vaultx.page.maskedValue', uiCopy('u_7f8c34471d2792f4'))}
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
                  {t('console.vaultx.page.encryptedNote', uiCopy('u_39e918af28bff68c'))}
                </p>
              </div>

              {selectedSecret.expires_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                    {t('console.vaultx.page.expiration', uiCopy('u_99d0a522d7f6766a'))}
                  </div>
                  <div style={{ fontSize: 13, color: '#fff' }}>
                    {new Date(selectedSecret.expires_at).toLocaleDateString(uiCopy('u_eca0d3faa96deb68'), {
                      year: uiCopy('u_fe4234ad7e314d46'),
                      month: uiCopy('u_e44f894cb9d24b41'),
                      day: uiCopy('u_04982f49819aeded'),
                    })}
                  </div>
                </div>
              )}

              {selectedSecret.last_rotated_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                    {t('console.vaultx.page.lastRotated', uiCopy('u_9d26ed456f913170'))}
                  </div>
                  <div style={{ fontSize: 13, color: '#fff' }}>
                    {new Date(selectedSecret.last_rotated_at).toLocaleDateString(uiCopy('u_dbafb0647e7ec012'), {
                      year: uiCopy('u_662380e4269a2141'),
                      month: uiCopy('u_88386889047fca84'),
                      day: uiCopy('u_d5ab0a8c1e455605'),
                    })}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  {t('console.vaultx.page.typeEnv', uiCopy('u_d80458a391d4d84c'))}
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
