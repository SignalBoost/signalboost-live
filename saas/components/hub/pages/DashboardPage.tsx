// saas/components/hub/pages/DeploymentsPage.tsx
'use client'

// Hub Console — Vercel Deployments workspace.
// mode='view'      -> read-only history (default; used by sidebar utility page)
// mode='rollback'  -> each READY deployment gets a "Roll back to this" action
// mode='cancel'    -> each in-progress build gets a "Cancel build" action
// Actions hit POST /api/hub/deployments { action, deploymentId } — real Vercel calls.

import { useState, useEffect } from 'react'
import { Deployment } from '@/lib/hub/deployments-service'
import { cardStyle, labelStyle } from '../shared'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type DeployMode = 'view' | 'rollback' | 'cancel'

const IN_PROGRESS = new Set(['BUILDING', 'QUEUED', 'INITIALIZING'])

export function DeploymentsPage({ mode = 'view' }: { mode?: DeployMode }) {
  const { dict } = useI18n()
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchDeployments()
  }, [])

  function flash(msg: string) {
    setNotice(msg)
    setError(null)
    window.setTimeout(() => setNotice(null), 3500)
  }

  async function fetchDeployments() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/hub/deployments?t=' + Date.now(), { cache: 'no-store' })
      const data = await res.json()

      if (data.ok) {
        setDeployments(data.deployments || [])
      } else {
        setError(data.error || t(dict, 'console.deploy.err.load', 'Failed to load deployments'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t(dict, 'console.deploy.err.loading', 'Error loading deployments'))
    } finally {
      setLoading(false)
    }
  }

  async function runAction(action: 'rollback' | 'cancel', d: Deployment) {
    const verb = action === 'rollback' ? t(dict, 'console.deploy.rollbackVerb', 'Roll back to') : t(dict, 'console.deploy.cancelVerb', 'Cancel build')
    const tail = action === 'rollback'
      ? `${d.url || d.id}? ${t(dict, 'console.deploy.rollbackTail', 'This promotes it back to production.')}`
      : `${d.url || d.id}? ${t(dict, 'console.deploy.cancelTail', 'This aborts the running build.')}`
    if (!window.confirm(`${verb} ${tail}`)) return

    setBusyId(d.id)
    setError(null)
    try {
      const res = await fetch('/api/hub/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, deploymentId: d.id }),
      })
      const data = await res.json()
      if (data.ok) {
        flash(data.message || (action === 'rollback' ? t(dict, 'console.deploy.rollbackDone', 'Rollback complete') : t(dict, 'console.deploy.cancelDone', 'Build canceled')))
        await fetchDeployments()
      } else {
        setError(data.error || `${t(dict, 'console.deploy.failedAction', 'Failed to')} ${action}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${t(dict, 'console.deploy.errorDuring', 'Error during')} ${action}`)
    } finally {
      setBusyId(null)
    }
  }

  const stateColor: Record<string, string> = {
    READY: '#22c55e',
    BUILDING: '#3b82f6',
    ERROR: '#ef4444',
    CANCELED: '#888',
    INITIALIZING: '#fbbf24',
    QUEUED: '#fbbf24',
  }

  const heading =
    mode === 'rollback' ? t(dict, 'console.deploy.headingRollback', 'Rollback Deploy')
    : mode === 'cancel' ? t(dict, 'console.deploy.headingCancel', 'Cancel Build')
    : t(dict, 'console.deploy.heading', 'Deployments')

  const subtitle =
    mode === 'rollback' ? t(dict, 'console.deploy.subRollback', 'Pick a previous READY deployment to promote back to production.')
    : mode === 'cancel' ? t(dict, 'console.deploy.subCancel', 'Abort an in-progress build (BUILDING, QUEUED, or INITIALIZING).')
    : t(dict, 'console.deploy.sub', 'Recent Vercel deployment history and status.')

  return (
    <div style={{ padding: '0.5rem 0.25rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '0.35rem', color: '#1af0ff' }}>
            {heading}
          </h2>
          <p style={{ color: '#888', fontSize: '0.9rem', margin: 0 }}>{subtitle}</p>
        </div>
        <button
          onClick={fetchDeployments}
          style={{ padding: '7px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.72)' }}
        >
          {loading ? '…' : t(dict, 'console.deploy.refresh', '↻ Refresh')}
        </button>
      </div>

      {error && (
        <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(255,0,0,.08)', border: '1px solid rgba(255,107,107,.3)', color: '#ff8a8a', fontSize: 13, marginBottom: 14, whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(26,240,255,.08)', border: '1px solid rgba(26,240,255,.3)', color: '#1af0ff', fontSize: 13, marginBottom: 14 }}>
          {notice}
        </div>
      )}

      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          {t(dict, 'console.deploy.loading', 'Loading deployments...')}
        </div>
      ) : deployments.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          {t(dict, 'console.deploy.empty', 'No deployments found')}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {deployments.map((deployment, idx) => {
            // The first READY deployment is the current production target — can't roll back to itself.
            const isCurrent = idx === 0
            const canRollback = mode === 'rollback' && deployment.state === 'READY' && !isCurrent
            const canCancel = mode === 'cancel' && IN_PROGRESS.has(deployment.state)
            return (
              <DeploymentCard
                key={deployment.id}
                deployment={deployment}
                expanded={expandedId === deployment.id}
                onToggle={() => setExpandedId(expandedId === deployment.id ? null : deployment.id)}
                stateColor={stateColor[deployment.state] || '#888'}
                mode={mode}
                isCurrent={isCurrent}
                canRollback={canRollback}
                canCancel={canCancel}
                busy={busyId === deployment.id}
                onRollback={() => runAction('rollback', deployment)}
                onCancel={() => runAction('cancel', deployment)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function actionBtn(tone: 'gold' | 'danger', disabled?: boolean): React.CSSProperties {
  const map = {
    gold: { border: '1px solid rgba(255,195,0,.45)', background: 'rgba(255,195,0,.12)', color: '#ffc300' },
    danger: { border: '1px solid rgba(239,68,68,.45)', background: 'rgba(239,68,68,.12)', color: '#ff6b6b' },
  } as const
  return {
    padding: '7px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 800,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1, ...map[tone],
  }
}

function DeploymentCard({
  deployment,
  expanded,
  onToggle,
  stateColor,
  mode,
  isCurrent,
  canRollback,
  canCancel,
  busy,
  onRollback,
  onCancel,
}: {
  deployment: Deployment
  expanded: boolean
  onToggle: () => void
  stateColor: string
  mode: DeployMode
  isCurrent: boolean
  canRollback: boolean
  canCancel: boolean
  busy: boolean
  onRollback: () => void
  onCancel: () => void
}) {
  const { dict } = useI18n()
  const date = new Date(deployment.createdAt)
  const timeAgo = getTimeAgo(date, dict)
  const showActionRow = mode !== 'view'

  return (
    <div style={cardStyle}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          paddingBottom: expanded ? '1rem' : '0',
          borderBottom: expanded ? `1px solid #333` : 'none',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.45rem' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: stateColor, flexShrink: 0 }} />
            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {deployment.url || t(dict, 'console.deploy.deployment', 'Deployment')}
            </div>
            {isCurrent && (
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: '#22c55e', border: '1px solid rgba(34,197,94,.4)', borderRadius: 6, padding: '2px 6px', flexShrink: 0 }}>
                {t(dict, 'console.deploy.current', 'CURRENT')}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: '#888', flexWrap: 'wrap' }}>
            <span style={{ color: stateColor, fontWeight: 'bold' }}>{deployment.state}</span>
            <span>{timeAgo}</span>
            {deployment.createdBy && <span>{t(dict, 'console.deploy.by', 'by')} {deployment.createdBy}</span>}
          </div>
        </div>

        <div style={{ fontSize: '1.25rem', color: '#666', marginLeft: '1rem' }}>
          {expanded ? '▼' : '▶'}
        </div>
      </div>

      {showActionRow && (
        <div style={{ display: 'flex', gap: 8, marginTop: '0.85rem', flexWrap: 'wrap' }}>
          {mode === 'rollback' && (
            canRollback ? (
              <button onClick={(e) => { e.stopPropagation(); onRollback() }} disabled={busy} style={actionBtn('gold', busy)}>
                {busy ? t(dict, 'console.deploy.promoting', 'Promoting…') : t(dict, 'console.deploy.rollbackThis', '↩️ Roll back to this')}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', alignSelf: 'center' }}>
                {isCurrent ? t(dict, 'console.deploy.currentTarget', '🔒 current production target') : t(dict, 'console.deploy.onlyReady', 'Only READY deployments can be promoted')}
              </span>
            )
          )}
          {mode === 'cancel' && (
            canCancel ? (
              <button onClick={(e) => { e.stopPropagation(); onCancel() }} disabled={busy} style={actionBtn('danger', busy)}>
                {busy ? t(dict, 'console.deploy.canceling', 'Canceling…') : t(dict, 'console.deploy.cancelBuild', '🛑 Cancel build')}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', alignSelf: 'center' }}>
                {t(dict, 'console.deploy.notInProgress', 'Not in progress — nothing to cancel')}
              </span>
            )
          )}
        </div>
      )}

      {expanded && (
        <div style={{ paddingTop: '1rem', display: 'grid', gap: '1rem' }}>
          <div>
            <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>{t(dict, 'console.deploy.liveUrl', 'Live URL')}</div>
            <a href={`https://${deployment.url}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1af0ff', textDecoration: 'none', wordBreak: 'break-all', fontSize: '0.9rem' }}
            >
              https://{deployment.url} →
            </a>
          </div>

          {deployment.meta?.githubCommitSha && (
            <div>
              <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>{t(dict, 'console.deploy.gitCommit', 'Git Commit')}</div>
              <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                <div style={{ color: '#888', marginBottom: '0.25rem' }}>{deployment.meta.githubCommitRef || 'main'}</div>
                <div style={{ color: '#1af0ff', marginBottom: '0.25rem' }}>{deployment.meta.githubCommitSha.substring(0, 7)}</div>
                {deployment.meta.githubCommitMessage && (
                  <div style={{ color: '#aaa', fontSize: '0.75rem', marginTop: '0.5rem' }}>{deployment.meta.githubCommitMessage}</div>
                )}
                {deployment.meta.githubCommitAuthorName && (
                  <div style={{ color: '#888', fontSize: '0.75rem' }}>{deployment.meta.githubCommitAuthorName}</div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{t(dict, 'console.deploy.deploymentId', 'Deployment ID')}</div>
              <div style={{ color: '#1af0ff', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {deployment.id.substring(0, 12)}...
              </div>
            </div>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{t(dict, 'console.deploy.created', 'Created')}</div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>{date.toLocaleString()}</div>
            </div>
          </div>

          {deployment.alias && deployment.alias.length > 0 && (
            <div>
              <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>{t(dict, 'console.deploy.aliases', 'Aliases')}</div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                {deployment.alias.map((alias, i) => (
                  <div key={i} style={{ color: '#1af0ff', fontSize: '0.85rem' }}>{alias}</div>
                ))}
              </div>
            </div>
          )}

          {deployment.inspectorUrl && (
            <a href={deployment.inspectorUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0.75rem', background: '#1a1a2e', color: '#1af0ff', textDecoration: 'none', borderRadius: '4px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold' }}
            >
              {t(dict, 'console.deploy.inspector', '📊 View Deployment Details in Inspector →')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function getTimeAgo(date: Date, dict: any): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  if (seconds < 60) return t(dict, 'console.deploy.justNow', 'just now')
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${t(dict, 'console.deploy.minAgo', 'm ago')}`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t(dict, 'console.deploy.hourAgo', 'h ago')}`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}${t(dict, 'console.deploy.dayAgo', 'd ago')}`
  return date.toLocaleDateString()
}
