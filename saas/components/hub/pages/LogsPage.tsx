// saas/components/hub/pages/LogsPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { AuditLog } from '@/lib/hub/logs-service'
import { cardStyle, labelStyle, bodyStyle, TONES } from '../shared'
import { useTranslation } from '@/components/i18n/useTranslation'

interface LogStats {
  totalActions: number
  successRate: number
  failedActions: number
  uniqueUsers: number
  actionsBy24h: number
}

export function LogsPage() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterAction, setFilterAction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSecretId, setFilterSecretId] = useState('')
  const [filterUserEmail, setFilterUserEmail] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    fetchLogs()
    fetchStats()
    const interval = setInterval(() => {
      fetchLogs()
      fetchStats()
    }, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [filterAction, filterStatus, filterSecretId, filterUserEmail, page])

  async function fetchLogs() {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        action: filterAction,
        status: filterStatus,
        secretId: filterSecretId,
        userEmail: filterUserEmail,
        limit: '50',
        offset: String(page * 50),
      })

      const res = await fetch(`/api/hub/logs?${params}`)
      const data = await res.json()

      if (data.ok) {
        setLogs(data.logs || [])
      } else {
        setError(data.error || t('console.logs.err_load', 'Failed to load logs'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.logs.err_load2', 'Error loading logs'))
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/hub/logs/stats')
      const data = await res.json()

      if (data.ok) {
        setStats(data.stats)
      }
    } catch (err) {
      // Non-fatal
    }
  }

  async function exportLogs() {
    try {
      const params = new URLSearchParams({
        action: filterAction,
        status: filterStatus,
        secretId: filterSecretId,
        userEmail: filterUserEmail,
      })

      const res = await fetch(`/api/hub/logs/export?${params}`)
      const data = await res.json()

      if (data.ok && data.csv) {
        const blob = new Blob([data.csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.logs.err_export', 'Export failed'))
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>{t('console.logs.title', 'Audit Logs')}</h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>{t('console.logs.subtitle', 'Real-time activity log of all vault operations')}</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <StatCard label={t('console.logs.stat_actions_24h', 'Actions (24h)')} value={stats.actionsBy24h} color="#1af0ff" />
          <StatCard label={t('console.logs.stat_success_rate', 'Success Rate')} value={`${stats.successRate}%`} color="#22c55e" />
          <StatCard label={t('console.logs.stat_failed', 'Failed Actions')} value={stats.failedActions} color="#ef4444" />
          <StatCard label={t('console.logs.stat_unique_users', 'Unique Users')} value={stats.uniqueUsers} color="#fbbf24" />
        </div>
      )}

      {/* Filters */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1rem' }}>{t('console.logs.filters', 'Filters')}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>{t('console.logs.action', 'Action')}</label>
            <select
              value={filterAction}
              onChange={e => {
                setFilterAction(e.target.value)
                setPage(0)
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid #333`,
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            >
              <option value="">{t('console.logs.all_actions', 'All Actions')}</option>
              <option value="accessed">{t('console.logs.accessed', 'Accessed')}</option>
              <option value="rotated">{t('console.logs.rotated', 'Rotated')}</option>
              <option value="verified">{t('console.logs.verified', 'Verified')}</option>
              <option value="created">{t('console.logs.created', 'Created')}</option>
              <option value="deleted">{t('console.logs.deleted', 'Deleted')}</option>
              <option value="revoked">{t('console.logs.revoked', 'Revoked')}</option>
              <option value="exported">{t('console.logs.exported', 'Exported')}</option>
            </select>
          </div>

          <div>
            <label style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>{t('console.logs.status', 'Status')}</label>
            <select
              value={filterStatus}
              onChange={e => {
                setFilterStatus(e.target.value)
                setPage(0)
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid #333`,
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            >
              <option value="">{t('console.logs.all_statuses', 'All Statuses')}</option>
              <option value="success">{t('console.logs.success', 'Success')}</option>
              <option value="failed">{t('console.logs.failed', 'Failed')}</option>
              <option value="pending">{t('console.logs.pending', 'Pending')}</option>
            </select>
          </div>

          <div>
            <label style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>{t('console.logs.secret_id', 'Secret ID')}</label>
            <input
              type="text"
              placeholder={t('console.logs.ph_secret', 'Filter by secret')}
              value={filterSecretId}
              onChange={e => {
                setFilterSecretId(e.target.value)
                setPage(0)
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid #333`,
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            />
          </div>

          <div>
            <label style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>{t('console.logs.user_email', 'User Email')}</label>
            <input
              type="text"
              placeholder={t('console.logs.ph_user', 'Filter by user')}
              value={filterUserEmail}
              onChange={e => {
                setFilterUserEmail(e.target.value)
                setPage(0)
              }}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid #333`,
                borderRadius: '4px',
                background: '#0a0a0a',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            />
          </div>
        </div>

        <button
          onClick={exportLogs}
          style={{
            padding: '0.5rem 1rem',
            background: '#ffc300',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 'bold',
          }}
        >{'📥 ' + t('console.logs.export_csv', 'Export as CSV')}</button>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.logs.loading', 'Loading logs...')}</div>
      ) : error ? (
        <div style={{ ...cardStyle, padding: '1rem', background: '#1a0000', color: '#ff6b6b', borderRadius: '4px' }}>
          {error}
        </div>
      ) : logs.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.logs.no_logs', 'No logs found')}</div>
      ) : (
        <>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.85rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: '#888' }}>{t('console.logs.timestamp', 'Timestamp')}</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: '#888' }}>{t('console.logs.action', 'Action')}</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: '#888' }}>{t('console.logs.secret_id', 'Secret ID')}</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: '#888' }}>{t('console.logs.col_user', 'User')}</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: '#888' }}>{t('console.logs.status', 'Status')}</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', color: '#888' }}>{t('console.logs.message', 'Message')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <td style={{ padding: '0.75rem', color: '#aaa' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#1af0ff', fontWeight: 'bold' }}>
                      {log.action}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#888', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {log.secret_id.substring(0, 20)}...
                    </td>
                    <td style={{ padding: '0.75rem', color: '#aaa' }}>
                      {log.user_email}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '3px',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          background: log.status === 'success' ? '#0a2a0a' : log.status === 'failed' ? '#2a0a0a' : '#2a2a0a',
                          color: log.status === 'success' ? '#22c55e' : log.status === 'failed' ? '#ef4444' : '#fbbf24',
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#888', fontSize: '0.8rem' }}>
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem', padding: '1rem' }}>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              style={{
                padding: '0.5rem 1rem',
                background: page === 0 ? '#333' : '#1af0ff',
                color: page === 0 ? '#666' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: page === 0 ? 'default' : 'pointer',
                fontWeight: 'bold',
              }}
            >{'← ' + t('console.logs.previous', 'Previous')}</button>
            <div style={{ display: 'flex', alignItems: 'center', color: '#888' }}>{t('console.logs.page_n', 'Page {n}').replace('{n}', String(page + 1))}</div>
            <button
              onClick={() => setPage(page + 1)}
              disabled={logs.length < 50}
              style={{
                padding: '0.5rem 1rem',
                background: logs.length < 50 ? '#333' : '#1af0ff',
                color: logs.length < 50 ? '#666' : '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: logs.length < 50 ? 'default' : 'pointer',
                fontWeight: 'bold',
              }}
            >{t('console.logs.next', 'Next') + ' →'}</button>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        ...cardStyle,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.5rem',
      }}
    >
      <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        {label}
      </div>
      <div style={{ color: color, fontSize: '2rem', fontWeight: 'bold' }}>
        {value}
      </div>
    </div>
  )
}
