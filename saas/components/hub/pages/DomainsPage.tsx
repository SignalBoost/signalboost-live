// saas/components/hub/pages/DomainsPage.tsx
'use client'

import { useState, useEffect } from 'react'
import { VercelDomain, SSLCertificate, Domain } from '@/lib/hub/domains-types'
import { cardStyle, labelStyle, bodyStyle, TONES } from '../shared.tsx'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
        setError(data.error || t('console.domains.err_load', uiCopy('u_7239222ea768991d')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.domains.err_load2', uiCopy('u_9a0631b6cb534e73')))
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
        setError(data.error || t('console.domains.err_add', uiCopy('u_0007461ebfcfe7bc')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.domains.err_add2', uiCopy('u_96dee6267388bb97')))
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
        setError(data.error || t('console.domains.err_verify', uiCopy('u_56939eee0e1cefa8')))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('console.domains.err_verify2', uiCopy('u_a5c83fc2ff969478')))
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1af0ff' }}>{t('console.domains.title', uiCopy('u_0c8693d397593cc1'))}</h2>
        <p style={{ color: '#888', fontSize: '0.9rem' }}>{t('console.domains.subtitle', uiCopy('u_6024253f8e8726ea'))}</p>
      </div>

      {/* Add Domain Form */}
      <div style={{ ...cardStyle, marginBottom: '2rem' }}>
        <h3 style={{ ...labelStyle, marginBottom: '1rem' }}>{t('console.domains.add_domain', uiCopy('u_0c951ff68ba611b2'))}</h3>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder={uiCopy('u_72ac77e6542a2c08')}
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
          >{t('console.domains.add', uiCopy('u_1136397b843a24bb'))}</button>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: '#1a0000', color: '#ff6b6b', borderRadius: '4px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
      </div>

      {/* Domains List */}
      {loading ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.domains.loading', uiCopy('u_f06dfeb4451f48a4'))}</div>
      ) : domains.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '2rem', color: '#888' }}>{t('console.domains.empty', uiCopy('u_29881c03b6d4e0d7'))}</div>
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
  const statusText = domain.verified ? t('console.domains.verified', uiCopy('u_fcba7f7be9c2bbf9')) : t('console.domains.pending', uiCopy('u_84ff87625fb1ad66'))

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
              <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>{t('console.domains.verification_required', uiCopy('u_62ee9386f5aed7da'))}</div>
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
              >{t('console.domains.check_verification', uiCopy('u_f823b6d1cc967e35'))}</button>
            </div>
          )}

          {/* SSL Certificate */}
          {domain.ssl && (
            <div style={{ background: '#1a1a2e', padding: '1rem', borderRadius: '4px' }}>
              <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>{t('console.domains.ssl_cert', uiCopy('u_769e050f89bf8e54'))}</div>
              <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#888' }}>{t('console.domains.status', uiCopy('u_28b2f3faa62c4517'))}: </span>
                  <span style={{ color: domain.ssl.status === 'issued' ? '#22c55e' : '#fbbf24' }}>
                    {domain.ssl.status}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#888' }}>{t('console.domains.expires', uiCopy('u_c08995a91cfe3a36'))}: </span>
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
              <div style={{ ...labelStyle, marginBottom: '0.5rem' }}>{t('console.domains.nameservers', uiCopy('u_6e91024f19bffd0c'))}</div>
              <div style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                <div>{uiCopy('u_95be428791dc2b05')}</div>
                <div>{uiCopy('u_1f76838761903212')}</div>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', marginBottom: '0.25rem' }}>{t('console.domains.created', uiCopy('u_522675ca903ee67d'))}</div>
              <div style={{ color: '#1af0ff' }}>{new Date(domain.createdAt).toLocaleDateString()}</div>
            </div>
            <div style={{ background: '#1a1a2e', padding: '0.75rem', borderRadius: '4px' }}>
              <div style={{ color: '#888', marginBottom: '0.25rem' }}>{t('console.domains.updated', uiCopy('u_20909d57d659bc66'))}</div>
              <div style={{ color: '#1af0ff' }}>{new Date(domain.updatedAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
