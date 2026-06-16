// saas/components/hub/pages/DomainsPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { VercelDomain, SSLCertificate, Domain } from '@/lib/hub/domains-types'
import { cardStyle, labelStyle, bodyStyle, TONES } from '../shared'
import { useTranslation } from '@/components/i18n/useTranslation'

export function DomainsPage() {
  const { t } = useTranslation()
  const [domains, setDomains] = useState<VercelDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)

  useEffect(() => {
    fetchDomains()
  }, [])

  async function fetchDomains() {
    try {
      setLoading(true)
      const res = await fetch('/api/hub/domains/list')
      const data = await res.json()

      if (data.ok) {
        setDomains(data.domains || [])
      } else {
        setError(data.error || t('console.domains.err_load', 'Failed to load domains'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.domains.err_load2', 'Error loading domains'))
    } finally {
      setLoading(false)
    }
  }

  async function addDomain() {
    if (!newDomain.trim()) return

    try {
      const res = await fetch('/api/hub/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain }),
      })

      const data = await res.json()

      if (data.ok) {
        setNewDomain('')
        fetchDomains()
      } else {
        setError(data.error || t('console.domains.err_add', 'Failed to add domain'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.domains.err_add2', 'Error adding domain'))
    }
  }

  async function verifyDomain(domain: string) {
    try {
      const res = await fetch('/api/hub/domains/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })

      const data = await res.json()

      if (data.ok) {
        fetchDomains()
      } else {
        setError(data.error || t('console.domains.err_verify', 'Verification failed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.domains.err_verify2', 'Error verifying domain'))
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>{t('console.domains.title', 'Domains & DNS')}</h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>{t('console.domains.subtitle', 'Manage domains, DNS records, and SSL certificates')}</p>
      </div>

      {/* Add Domain Form */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1rem' }}>{t('console.domains.add_domain', 'Add Domain')}</h3>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="example.com"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDomain()}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: `1px solid #333`,
              borderRadius: '4px',
              background: '#0a0a0a',
              color: '#fff',
              fontSize: '0.9rem',
            }}
          />
          <button
            onClick={addDomain}
            disabled={!newDomain.trim() || loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#1af0ff',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.9rem',
              opacity: !newDomain.trim() || loading ? 0.5 : 1,
            }}
          >{t('console.domains.add', 'Add')}</button>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: '#1a0000', color: '#ff6b6b', borderRadius: '4px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* Domains List */}
      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.domains.loading', 'Loading domains...')}</div>
      ) : domains.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.domains.empty', 'No domains configured yet')}</div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {domains.map(domain => (
            <DomainCard
              key={domain.name}
              domain={domain}
              expanded={expandedDomain === domain.name}
              onToggle={() => setExpandedDomain(expandedDomain === domain.name ? null : domain.name)}
              onVerify={() => verifyDomain(domain.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DomainCard({
  domain,
  expanded,
  onToggle,
  onVerify,
}: {
  domain: VercelDomain
  expanded: boolean
  onToggle: () => void
  onVerify: () => void
}) {
  const { t } = useTranslation()
  const statusColor = domain.verified ? '#22c55e' : '#fbbf24'
  const statusText = domain.verified ? t('console.domains.verified', 'Verified') : t('console.domains.pending', 'Pending Verification')

  return (
    <div style={cardStyle}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          paddingBottom: '1rem',
          borderBottom: expanded ? `1px solid #333` : 'none',
        }}
      >
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            {domain.name}
          </div>
          <div style={{ fontSize: '0.85rem', color: statusColor }}>
            ● {statusText}
          </div>
        </div>
        <div style={{ fontSize: '1.5rem', color: '#666' }}>
          {expanded ? '▼' : '▶'}
        </div>
      </div>

      {expanded && (
        <div style={{ paddingTop: '1rem', display: 'grid', gap: '1rem' }}>
          {/* Verification */}
          {!domain.verified && domain.verification && (
            <div style={{ background: '#1a1a2e', padding: '1rem', borderRadius: '4px', borderLeft: `3px solid #fbbf24` }}>
              <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>{t('console.domains.verification_required', 'Verification Required')}</div>
              {domain.verification.map((v, i) => (
                <div key={i} style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
                  <div style={{ color: '#888' }}>{v.type.toUpperCase()}</div>
                  <div style={{ color: '#1af0ff', wordBreak: 'break-all' }}>{v.value}</div>
                </div>
              ))}
              <button
                onClick={onVerify}
                style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem 1rem',
                  background: '#1af0ff',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                }}
              >{t('console.domains.check_verification', 'Check Verification')}</button>
            </div>
          )}

          {/* SSL Certificate */}
          {domain.ssl && (
            <div style={{ background: '#1a1a2e', padding: '1rem', borderRadius: '4px' }}>
              <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>{t('console.domains.ssl_cert', 'SSL Certificate')}</div>
              <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#888' }}>{t('console.domains.status', 'Status')}: </span>
                  <span style={{ color: domain.ssl.status === 'issued' ? '#22c55e' : '#fbbf24' }}>
                    {domain.ssl.status}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>{t('console.domains.expires', 'Expires')}: </span>
                  <span style={{ color: '#1af0ff' }}>
                    {new Date(domain.ssl.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Nameservers */}
          {domain.verified && (
            <div style={{ background: '#1a1a2e', padding: '1rem', borderRadius: '4px' }}>
              <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>{t('console.domains.nameservers', 'Nameservers')}</div>
              <div style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                <div>ns1.vercel-dns.com</div>
                <div>ns2.vercel-dns.com</div>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', marginBottom: '0.25rem' }}>{t('console.domains.created', 'Created')}</div>
              <div style={{ color: '#1af0ff' }}>{new Date(domain.createdAt).toLocaleDateString()}</div>
            </div>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', marginBottom: '0.25rem' }}>{t('console.domains.updated', 'Updated')}</div>
              <div style={{ color: '#1af0ff' }}>{new Date(domain.updatedAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
