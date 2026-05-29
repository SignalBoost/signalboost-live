'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'

type Lead = {
  id: string
  company?: string
  contact_name?: string
  email?: string
  industry?: string
  country?: string
  language?: string
  status?: string
  draft_subject?: string
  draft_body?: string
  last_error?: string
}

const STATUSES = [
  'discovered',
  'approved',
  'draft_ready',
  'sketch_ready',
  'sent',
  'replied',
  'client',
  'draft_failed',
]

export default function SalesPipelinePage() {
  const { t } = useTranslation()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLeads()
  }, [])

  async function loadLeads() {
    setLoading(true)

    try {
      const res = await fetch('/api/sales/pipeline')
      const data = await res.json()
      setLeads(data.leads || [])
    } catch {
      setLeads([])
    }

    setLoading(false)
  }

  const grouped = STATUSES.map(status => ({
    status,
    leads: leads.filter(l => (l.status || 'discovered') === status),
  }))

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 40,
        background: '#060913',
        color: '#fff',
        fontFamily: 'system-ui',
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontSize: 42, marginBottom: 8 }}>
          {t('sales.pipeline.title', 'Sales Pipeline')}
        </h1>

        <p style={{ color: 'rgba(255,255,255,.6)', marginBottom: 28 }}>
          {t('sales.pipeline.subtitle', 'Track prospects from discovery to client.')}
        </p>

        {loading ? (
          <div style={emptyStyle}>{t('sales.pipeline.loading', 'Loading pipeline...')}</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
              gap: 16,
              alignItems: 'start',
            }}
          >
            {grouped.map(group => (
              <section
                key={group.status}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: 'rgba(255,255,255,.04)',
                  border: '1px solid rgba(255,255,255,.08)',
                  minHeight: 180,
                }}
              >
                <h2
                  style={{
                    fontSize: 14,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    color: '#ffc300',
                    marginBottom: 14,
                  }}
                >
                  {t(`sales.status.${group.status}`, label(group.status))} ({group.leads.length})
                </h2>

                {group.leads.length === 0 && (
                  <div style={emptyStyle}>{t('sales.pipeline.noLeads', 'No leads')}</div>
                )}

                {group.leads.map(lead => (
                  <article
                    key={lead.id}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: 'rgba(0,0,0,.25)',
                      border: '1px solid rgba(255,255,255,.08)',
                      marginBottom: 12,
                    }}
                  >
                    <strong>{lead.company || t('sales.pipeline.unnamed', 'Unnamed company')}</strong>

                    <div style={metaStyle}>
                      {lead.industry || t('sales.pipeline.noIndustry', 'No industry')} · {lead.country || t('sales.pipeline.noCountry', 'No country')}
                    </div>

                    <div style={metaStyle}>
                      {lead.email || t('sales.pipeline.noEmail', 'No email')}
                    </div>

                    {lead.draft_subject && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: 10,
                          borderRadius: 10,
                          background: 'rgba(255,195,0,.06)',
                          color: 'rgba(255,255,255,.75)',
                          fontSize: 12,
                        }}
                      >
                        <strong>{t('sales.pipeline.draft', 'Draft:')}</strong> {lead.draft_subject}
                      </div>
                    )}

                    {lead.last_error && (
                      <div
                        style={{
                          marginTop: 10,
                          color: '#ff6b6b',
                          fontSize: 12,
                        }}
                      >
                        {lead.last_error}
                      </div>
                    )}
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function label(status: string) {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

const metaStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: 'rgba(255,255,255,.5)',
}

const emptyStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,.35)',
  fontSize: 13,
}
