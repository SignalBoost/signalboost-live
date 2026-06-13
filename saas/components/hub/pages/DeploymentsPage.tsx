// saas/components/hub/pages/DeploymentsPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { Deployment } from '@/lib/hub/deployments-service'
import { cardStyle, labelStyle } from '../shared'

export function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchDeployments()
  }, [])

  async function fetchDeployments() {
    try {
      setLoading(true)
      const res = await fetch('/api/hub/deployments')
      const data = await res.json()

      if (data.ok) {
        setDeployments(data.deployments || [])
      } else {
        setError(data.error || 'Failed to load deployments')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading deployments')
    } finally {
      setLoading(false)
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

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>
          Deployments
        </h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          Recent Vercel deployment history and status
        </p>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          Loading deployments...
        </div>
      ) : error ? (
        <div style={{ ...cardStyle, padding: '1rem', background: '#1a0000', color: '#ff6b6b', borderRadius: '4px' }}>
          {error}
        </div>
      ) : deployments.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>
          No deployments found
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {deployments.map(deployment => (
            <DeploymentCard
              key={deployment.id}
              deployment={deployment}
              expanded={expandedId === deployment.id}
              onToggle={() => setExpandedId(expandedId === deployment.id ? null : deployment.id)}
              stateColor={stateColor[deployment.state]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DeploymentCard({
  deployment,
  expanded,
  onToggle,
  stateColor,
}: {
  deployment: Deployment
  expanded: boolean
  onToggle: () => void
  stateColor: string
}) {
  const date = new Date(deployment.createdAt)
  const timeAgo = getTimeAgo(date)

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
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: stateColor,
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff' }}>
                {deployment.url || 'Deployment'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', fontSize: '0.85rem', color: '#888' }}>
            <div>
              <span style={{ color: stateColor, fontWeight: 'bold' }}>
                {deployment.state}
              </span>
            </div>
            <div>{timeAgo}</div>
            {deployment.createdBy && <div>by {deployment.createdBy}</div>}
          </div>
        </div>

        <div style={{ fontSize: '1.5rem', color: '#666', marginLeft: '1rem' }}>
          {expanded ? '▼' : '▶'}
        </div>
      </div>

      {expanded && (
        <div style={{ paddingTop: '1rem', display: 'grid', gap: '1rem' }}>
          {/* URL */}
          <div>
            <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Live URL
            </div>
            <a
              href={`https://${deployment.url}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#1af0ff',
                textDecoration: 'none',
                wordBreak: 'break-all',
                fontSize: '0.9rem',
              }}
            >
              https://{deployment.url} →
            </a>
          </div>

          {/* Git Info */}
          {deployment.meta?.githubCommitSha && (
            <div>
              <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Git Commit
              </div>
              <div
                style={{
                  background: '#1a1a2e',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ color: '#888', marginBottom: '0.25rem' }}>
                  {deployment.meta.githubCommitRef || 'main'}
                </div>
                <div style={{ color: '#1af0ff', marginBottom: '0.25rem' }}>
                  {deployment.meta.githubCommitSha.substring(0, 7)}
                </div>
                {deployment.meta.githubCommitMessage && (
                  <div style={{ color: '#aaa', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    {deployment.meta.githubCommitMessage}
                  </div>
                )}
                {deployment.meta.githubCommitAuthorName && (
                  <div style={{ color: '#888', fontSize: '0.75rem' }}>
                    {deployment.meta.githubCommitAuthorName}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                Deployment ID
              </div>
              <div
                style={{
                  color: '#1af0ff',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  wordBreak: 'break-all',
                }}
              >
                {deployment.id.substring(0, 12)}...
              </div>
            </div>

            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                Created
              </div>
              <div style={{ color: '#1af0ff', fontSize: '0.85rem' }}>
                {date.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Aliases */}
          {deployment.alias && deployment.alias.length > 0 && (
            <div>
              <div style={{ ...labelStyle, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Aliases
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                {deployment.alias.map((alias, i) => (
                  <div key={i} style={{ color: '#1af0ff', fontSize: '0.85rem' }}>
                    {alias}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inspector Link */}
          {deployment.inspectorUrl && (
            <a
              href={deployment.inspectorUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.75rem',
                background: '#1a1a2e',
                color: '#1af0ff',
                textDecoration: 'none',
                borderRadius: '4px',
                textAlign: 'center',
                fontSize: '0.9rem',
                fontWeight: 'bold',
              }}
            >
              📊 View Deployment Details in Inspector →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString()
}
