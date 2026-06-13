'use client'

// saas/components/hub/vault/VaultAuditLog.tsx
// Read-only audit trail of all vault access and actions.

import { VaultAuditLog as VaultAuditLogType } from '@/lib/hub/vault-types'
import { labelStyle } from '../shared'

export type VaultAuditLogProps = {
  logs: VaultAuditLogType[]
  isLoading?: boolean
}

const actionIcon: Record<string, string> = {
  created: '✨',
  rotated: '🔄',
  accessed: '👁️',
  revoked: '🚫',
  failed_access: '❌',
}

export default function VaultAuditLog({ logs, isLoading = false }: VaultAuditLogProps) {
  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '2px solid rgba(26,240,255,.2)',
            borderTopColor: '#1af0ff',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        <p style={{ margin: 0, fontSize: 12 }}>Loading audit log...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,.5)' }}>
        <p style={{ margin: 0, fontSize: 12 }}>No audit log entries</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={labelStyle}>Audit Trail</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {logs.slice(0, 50).map(log => {
          const icon = actionIcon[log.action] || '📝'
          const statusColor = log.status === 'success' ? '#22c55e' : '#ef4444'
          const date = new Date(log.timestamp)
          const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <div
              key={log.id}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.08)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              {/* Icon */}
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 2 }}>{icon}</span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 4,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', textTransform: 'capitalize' }}>
                    {log.action.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 10, color: statusColor, fontWeight: 700 }}>
                    {log.status === 'success' ? '✓ Success' : '✗ Failed'}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginBottom: 3 }}>
                  {log.message}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    fontSize: 10,
                    color: 'rgba(255,255,255,.42)',
                  }}
                >
                  {log.user_email && <span>{log.user_email}</span>}
                  {log.ip_address && <span>IP: {log.ip_address}</span>}
                  <span>
                    {dateStr} {timeStr}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {logs.length > 50 && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.45)', padding: '8px 0' }}>
          Showing latest 50 of {logs.length} entries
        </div>
      )}
    </div>
  )
}
