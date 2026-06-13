'use client'

// saas/components/hub/vault/VaultSecretsGrid.tsx
// Read-only view of all vault secrets with status indicators and audit trail.

import { useMemo } from 'react'
import { VaultSecret, VaultExpirationAlert } from '@/lib/hub/vault-types'
import { cardStyle, labelStyle } from '../shared'

export type VaultSecretsGridProps = {
  secrets: VaultSecret[]
  alerts: VaultExpirationAlert[]
  onSelectSecret?: (secret: VaultSecret) => void
}

const statusIcon: Record<string, { icon: string; color: string; label: string }> = {
  active: { icon: '🟢', color: '#22c55e', label: 'Active' },
  expiring_soon: { icon: '⚠️', color: '#ffc300', label: 'Expiring Soon' },
  expired: { icon: '❌', color: '#ef4444', label: 'Expired' },
  rotated: { icon: '🔄', color: '#3b82f6', label: 'Recently Rotated' },
  revoked: { icon: '🚫', color: '#9ca3af', label: 'Revoked' },
}

const typeIcon: Record<string, string> = {
  api_key: '🔑',
  token: '🎫',
  password: '🔐',
  oauth2: '🔑',
  certificate: '📜',
  ssh_key: '🔑',
}

export default function VaultSecretsGrid({ secrets, alerts, onSelectSecret }: VaultSecretsGridProps) {
  const alertsBySecretId = useMemo(() => {
    const map: Record<string, VaultExpirationAlert> = {}
    alerts.forEach(a => {
      map[a.secret_id] = a
    })
    return map
  }, [alerts])

  if (secrets.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>No secrets in vault</div>
        <p style={{ margin: 0, fontSize: 12 }}>Secrets from connected providers will appear here.</p>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 12,
      }}
    >
      {secrets.map(secret => {
        const status = statusIcon[secret.status]
        const typeIc = typeIcon[secret.secret_type]
        const alert = alertsBySecretId[secret.id]

        return (
          <article
            key={secret.id}
            onClick={() => onSelectSecret?.(secret)}
            style={{
              ...cardStyle,
              padding: 14,
              cursor: onSelectSecret ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              transition: 'all .2s',
            }}
            onMouseEnter={e => {
              if (onSelectSecret) {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(26,240,255,.35)'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(26,240,255,.08)'
              }
            }}
            onMouseLeave={e => {
              if (onSelectSecret) {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.1)'
                ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.03)'
              }
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>{typeIc}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#fff' }}>
                    {secret.secret_name}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
                    {secret.provider_name}
                  </p>
                </div>
              </div>
              <span style={{ fontSize: 16 }}>{status.icon}</span>
            </div>

            {/* Masked value */}
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.08)',
                fontFamily: 'monospace',
                fontSize: 12,
                color: 'rgba(255,255,255,.65)',
                wordBreak: 'break-all',
              }}
            >
              {secret.masked_value}
            </div>

            {/* Status & environment */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  color: status.color,
                  background: status.color + '15',
                  border: `1px solid ${status.color}30`,
                  textTransform: 'capitalize',
                }}
              >
                {status.label}
              </span>
              {secret.environment && (
                <span
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,.65)',
                    background: 'rgba(255,255,255,.08)',
                    border: '1px solid rgba(255,255,255,.15)',
                    textTransform: 'capitalize',
                  }}
                >
                  {secret.environment}
                </span>
              )}
            </div>

            {/* Alert badge */}
            {alert && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: alert.severity === 'critical' ? 'rgba(239,68,68,.12)' : 'rgba(255,193,0,.12)',
                  border:
                    alert.severity === 'critical'
                      ? '1px solid rgba(239,68,68,.3)'
                      : '1px solid rgba(255,193,0,.3)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: alert.severity === 'critical' ? '#fca5a5' : '#fcd34d',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <span>{alert.severity === 'critical' ? '🔴' : '⚠️'}</span>
                <span>Expires in {alert.days_until_expiry} day{alert.days_until_expiry === 1 ? '' : 's'}</span>
              </div>
            )}

            {/* Metadata */}
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {secret.last_rotated_at && (
                <div>Last rotated: {new Date(secret.last_rotated_at).toLocaleDateString()}</div>
              )}
              {secret.expires_at && (
                <div>Expires: {new Date(secret.expires_at).toLocaleDateString()}</div>
              )}
              <div>Created: {new Date(secret.created_at).toLocaleDateString()}</div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
