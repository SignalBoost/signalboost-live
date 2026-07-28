
'use client'

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Prospect = {
  company: string
  contactName: string
  email: string
  website: string
  industry: string
  notes: string
}

type Draft = {
  subject: string
  body: string
}

export default function SalesPage() {
  const { t } = useTranslation()
  const [prospect, setProspect] = useState<Prospect>({
    company: '',
    contactName: '',
    email: '',
    website: '',
    industry: '',
    notes: '',
  })

  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(false)

  async function generateDraft() {
    setLoading(true)
    setDraft(null)

    const res = await fetch('/api/sales/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect }),
    })

    const data = await res.json()
    setDraft(data.draft)
    setLoading(false)
  }

  const mailto =
    draft && prospect.email
      ? `mailto:${prospect.email}?subject=${encodeURIComponent(
          draft.subject
        )}&body=${encodeURIComponent(draft.body)}`
      : '#'

  return (
    <main style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 12, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>🧠 {t('sales.eyebrow', uiCopy('u_cf6e20b8de1c1d0d'))}</p>
            <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.15, margin: '4px 0 0' }}>{t('sales.title', uiCopy('u_2c75bded0fce3594'))}</h1>
          </div>
          <span className="sb-chip" style={draft ? { borderColor: 'rgba(134,239,172,.3)', background: 'rgba(134,239,172,.08)', color: '#86efac' } : undefined}>{loading ? '...' : draft ? '✓' : uiCopy('u_11f6f09e2a2f4f30')}</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
          }}
        >
          <section>
            <h2 style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-.02em', margin: '0 0 4px' }}>{t('sales.prospect', uiCopy('u_c864c589599d79b7'))}</h2>

            {[
              [uiCopy('u_be30b1f440ff4e8e'), t('sales.company', uiCopy('u_1ec21e1b37af6262'))],
              [uiCopy('u_f2d41141ea228905'), t('sales.contact', uiCopy('u_fc30bd3931bf30d2'))],
              [uiCopy('u_3521f0e6fea542aa'), t('sales.email', uiCopy('u_66d7625bfeadf6da'))],
              [uiCopy('u_66abb36ca2e837e9'), t('sales.website', uiCopy('u_ade46916ef4ef8e0'))],
              [uiCopy('u_2b8f5d4bac1cac73'), t('sales.industry', uiCopy('u_46a9390244ac7bda'))],
            ].map(([key, label]) => (
              <input
                key={key}
                placeholder={label}
                value={(prospect as any)[key]}
                onChange={e =>
                  setProspect(prev => ({
                    ...prev,
                    [key]: e.target.value,
                  }))
                }
                style={inputStyle}
              />
            ))}

            <textarea
              placeholder={t('sales.notes', uiCopy('u_6cce13a62f564bde'))}
              value={prospect.notes}
              onChange={e =>
                setProspect(prev => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              style={{
                ...inputStyle,
                minHeight: 70,
                resize: 'vertical',
              }}
            />

            <button
              onClick={generateDraft}
              disabled={loading || !prospect.company}
              style={buttonStyle}
            >
              {loading ? t('sales.drafting', uiCopy('u_b95dff1ed42d80b6')) : t('sales.generate', uiCopy('u_2c4a2e632062a843'))}
            </button>
          </section>

          <section style={{ borderLeft: draft ? '2px solid rgba(255,195,0,.55)' : '1px solid rgba(255,255,255,.08)', paddingLeft: 20, height: 'calc(100vh - 230px)', minHeight: 380, overflowY: 'auto', transition: 'border-color .3s ease' }}>
            <h2 style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-.02em', margin: '0 0 4px' }}>{t('sales.aiDraft', uiCopy('u_24d5db0bc64ddf24'))}</h2>

            {!draft && (
              <div className="sb-empty" style={{ marginTop: 30 }}>
                {t('sales.emptyDraft', uiCopy('u_fdcced6dd9625869'))}
              </div>
            )}

            {draft && (
              <>
                <h3>{t('sales.subject', uiCopy('u_eb9592aafeb31c72'))}</h3>
                <div style={boxStyle}>{draft.subject}</div>

                <h3 style={{ marginTop: 24 }}>{t('sales.email', uiCopy('u_cfb08444482b9c3d'))}</h3>
                <div style={boxStyle}>{draft.body}</div>

                <a
                  href={mailto}
                  style={{
                    ...buttonStyle,
                    display: 'inline-block',
                    textDecoration: 'none',
                    marginTop: 24,
                  }}
                >
                  {t('sales.openEmail', uiCopy('u_b68a970b0ec3361a'))}
                </a>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 10,
  padding: 11,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(0,0,0,.25)',
  color: '#fff',
}

const buttonStyle: React.CSSProperties = {
  marginTop: 20,
  padding: '14px 22px',
  borderRadius: 999,
  border: 'none',
  background: '#ffc300',
  color: '#000',
  fontWeight: 800,
  cursor: 'pointer',
}

const boxStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  lineHeight: 1.7,
  padding: '12px 0',
  borderTop: '1px solid rgba(255,255,255,.08)',
  fontSize: 13.5,
}
