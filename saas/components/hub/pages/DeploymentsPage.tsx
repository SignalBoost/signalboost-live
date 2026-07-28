// saas/components/hub/pages/DeploymentsPage.tsx
'use client'

// Hub Console — Vercel Deployments workspace.
// mode='view'      -> read-only history (default; used by sidebar utility page)
// mode='rollback'  -> each READY deployment gets a "Roll back to this" action
// mode='cancel'    -> each in-progress build gets a "Cancel build" action
// Actions hit POST /api/hub/deployments { action, deploymentId } — real Vercel calls.

import { useState, useEffect } from 'react'
import { Deployment } from '@/lib/hub/deployments-service'
import { cardStyle, labelStyle } from '../shared.tsx'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type DeployMode = 'view' | 'rollback' | 'cancel'

const IN_PROGRESS = new Set(['BUILDING', 'QUEUED', 'INITIALIZING'])

export function DeploymentsPage({ mode = 'view' }: { mode?: DeployMode }) {
  const { t } = useTranslation()
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
        setError(data.error || t('console.deploy.err_load', uiCopy('u_4ede63c879a18d54')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.deploy.err_load2', uiCopy('u_ddc865acf36ba10e')))
    } finally {
      setLoading(false)
    }
  }

  async function runAction(action: 'rollback' | 'cancel', d: Deployment) {
    const target = d.url || d.id
    const confirmMsg = action === 'rollback'
      ? t('console.deploy.confirm_rollback', uiCopy('u_684a98579aa4a21d')).replace('{target}', target)
      : t('console.deploy.confirm_cancel', uiCopy('u_456f6f86cf093b26')).replace('{target}', target)
    if (!window.confirm(confirmMsg)) return

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
        flash(data.message || (action === 'rollback' ? t('console.deploy.done_rollback', uiCopy('u_0b95a1206681f290')) : t('console.deploy.done_cancel', uiCopy('u_21ac59ce19ad29ba'))))
        await fetchDeployments()
      } else {
        setError(data.error || (action === 'rollback' ? t('console.deploy.err_rollback', uiCopy('u_fbc25da7a2a8d5af')) : t('console.deploy.err_cancel', uiCopy('u_f0e7a8bb382a9235'))))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (action === 'rollback' ? t('console.deploy.err_during_rollback', uiCopy('u_0db78af2b44d3054')) : t('console.deploy.err_during_cancel', uiCopy('u_b16bfa0e9cac402a'))))
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
    mode === 'rollback' ? t('console.deploy.head_rollback', uiCopy('u_531b7b5a348bb7eb'))
    : mode === 'cancel' ? t('console.deploy.head_cancel', uiCopy('u_ea6a3d77b5342558'))
    : t('console.deploy.head_view', uiCopy('u_74dd75b7aa236cd8'))

  const subtitle =
    mode === 'rollback' ? t('console.deploy.sub_rollback', uiCopy('u_8c03093a9b6c9771'))
    : mode === 'cancel' ? t('console.deploy.sub_cancel', uiCopy('u_10f2523812306ed3'))
    : t('console.deploy.sub_view', uiCopy('u_9c423a891832a5c7'))

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
          {loading ? '…' : '↻ ' + t('console.deploy.refresh', uiCopy('u_7b189f45c2a1b252'))}
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
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.deploy.loading', uiCopy('u_0fedfc416db899ea'))}</div>
      ) : deployments.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.deploy.empty', uiCopy('u_c85af76f29002253'))}</div>
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
  const { t } = useTranslation()
  const date = new Date(deployment.createdAt)
  const timeAgo = getTimeAgo(date, t)
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
              {deployment.url || t('console.deploy.deployment', uiCopy('u_95c4f5749e352b8c'))}
            </div>
            {isCurrent && (
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: '#22c55e', border: '1px solid rgba(34,197,94,.4)', borderRadius: 6, padding: '2px 6px', flexShrink: 0 }}>{t('console.deploy.current', uiCopy('u_3acdc5f251a6c6fa'))}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem', color: '#888', flexWrap: 'wrap' }}>
            <span style={{ color: stateColor, fontWeight: 'bold' }}>{deployment.state}</span>
            <span>{timeAgo}</span>
            {deployment.createdBy && <span>{t('console.deploy.by', uiCopy('u_4da6e08e0d8282eb')).replace(uiCopy('u_631a857ec9f5f69a'), String(deployment.createdBy))}</span>}
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
                {busy ? t('console.deploy.promoting', uiCopy('u_151eae60d2bd345a')) : '↩️ ' + t('console.deploy.roll_back_this', uiCopy('u_8724182a63eb36ff'))}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', alignSelf: 'center' }}>
                {isCurrent ? '🔒 ' + t('console.deploy.current_target', uiCopy('u_5fee681b67e45e74')) : t('console.deploy.only_ready', uiCopy('u_710e0cc61aa2349e'))}
              </span>
            )
          )}
          {mode === 'cancel' && (
            canCancel ? (
              <button onClick={(e) => { e.stopPropagation(); onCancel() }} disabled={busy} style={actionBtn('danger', busy)}>
                {busy ? t('console.deploy.canceling', uiCopy('u_a5f6225e01fa8ba0')) : '🛑 ' + t('console.deploy.cancel_build', uiCopy('u_d2d0b4d769dd13fb'))}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', alignSelf: 'center' }}>{t('console.deploy.not_in_progress', uiCopy('u_50c2a3135ff3a979'))}</span>
            )
          )}
        </div>
      )}

      {expanded && (
        <div style={{ paddingTop: '1rem', display: 'grid', gap: '1rem' }}>
          <div>
            <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>{t('console.deploy.live_url', uiCopy('u_0f026ff34570dd00'))}</div>
            <a
              href={`https://${deployment.url}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1af0ff', textDecoration: 'none', wordBreak: 'break-all', fontSize: '0.9rem' }}
            >{uiCopy('u_0008dc0154e2fdde')}{deployment.url} →
            </a>
          </div>

          {deployment.meta?.githubCommitSha && (
            <div>
              <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>{t('console.deploy.git_commit', uiCopy('u_130ec9b8d9f126d7'))}</div>
              <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                <div style={{ color: '#888', marginBottom: '0.25rem' }}>{deployment.meta.githubCommitRef || uiCopy('u_cd14d28198862dfe')}</div>
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
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{t('console.deploy.deployment_id', uiCopy('u_dd769ee5efb5e92b'))}</div>
              <div style={{ color: '#1af0ff', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                {deployment.id.substring(0, 12)}...
              </div>
            </div>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{t('console.deploy.created', uiCopy('u_4e3d84011d4a39db'))}</div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>{date.toLocaleString()}</div>
            </div>
          </div>

          {deployment.alias && deployment.alias.length > 0 && (
            <div>
              <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>{t('console.deploy.aliases', uiCopy('u_ff8d24ece8555de4'))}</div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                {deployment.alias.map((alias, i) => (
                  <div key={i} style={{ color: '#1af0ff', fontSize: '0.85rem' }}>{alias}</div>
                ))}
              </div>
            </div>
          )}

          {deployment.inspectorUrl && (
            <a
              href={deployment.inspectorUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0.75rem', background: '#1a1a2e', color: '#1af0ff', textDecoration: 'none', borderRadius: '4px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold' }}
            >{'📊 ' + t('console.deploy.view_inspector', uiCopy('u_3b1cd66e36801dac')) + ' →'}</a>
          )}
        </div>
      )}
    </div>
  )
}

function getTimeAgo(date: Date, t: (k: string, f: string) => string): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  if (seconds < 60) return t('console.deploy.just_now', uiCopy('u_e04b602e7e99434c'))
  if (seconds < 3600) return t('console.deploy.m_ago', uiCopy('u_a4eb0faa0e57cc8b')).replace('{n}', String(Math.floor(seconds / 60)))
  if (seconds < 86400) return t('console.deploy.h_ago', uiCopy('u_b0a22f462197f27a')).replace('{n}', String(Math.floor(seconds / 3600)))
  if (seconds < 604800) return t('console.deploy.d_ago', uiCopy('u_a71628b79d117401')).replace('{n}', String(Math.floor(seconds / 86400)))
  return date.toLocaleDateString()
}
