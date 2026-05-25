
'use client'

import { useState } from 'react'

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
    <main
      style={{
        minHeight: '100vh',
        padding: 40,
        background: '#060913',
        color: '#fff',
        fontFamily: 'system-ui',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontSize: 42, marginBottom: 10 }}>
          🧠 AI Sales Agent
        </h1>

        <p style={{ color: 'rgba(255,255,255,.6)', marginBottom: 30 }}>
          Give the AI a prospect. It drafts a professional sales email for you to review and send.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
          }}
        >
          <section
            style={{
              padding: 24,
              borderRadius: 18,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2>Prospect</h2>

            {[
              ['company', 'Company name'],
              ['contactName', 'Contact name'],
              ['email', 'Email'],
              ['website', 'Website'],
              ['industry', 'Industry'],
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
              placeholder="Notes about this prospect"
              value={prospect.notes}
              onChange={e =>
                setProspect(prev => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              style={{
                ...inputStyle,
                minHeight: 120,
                resize: 'vertical',
              }}
            />

            <button
              onClick={generateDraft}
              disabled={loading || !prospect.company}
              style={buttonStyle}
            >
              {loading ? 'Drafting...' : 'Generate Sales Email'}
            </button>
          </section>

          <section
            style={{
              padding: 24,
              borderRadius: 18,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <h2>AI Draft</h2>

            {!draft && (
              <p style={{ color: 'rgba(255,255,255,.5)' }}>
                The sales email will appear here.
              </p>
            )}

            {draft && (
              <>
                <h3>Subject</h3>
                <div style={boxStyle}>{draft.subject}</div>

                <h3 style={{ marginTop: 24 }}>Email</h3>
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
                  Open in Email
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
  marginTop: 12,
  padding: 14,
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
  padding: 16,
  borderRadius: 12,
  background: 'rgba(0,0,0,.25)',
  border: '1px solid rgba(255,255,255,.08)',
}
