// saas/app/review/[slug]/page.tsx
//
// Public review submission page. No auth.
//
// Privacy:
//   * URL contains the owner's slug, not their uuid.
//   * This page shows ONLY the slug back to the reviewer. No email, no name,
//     no plan, no other reviews of this owner.
//   * Reviewer's email is collected (required) but never displayed back.

'use client'

import { useState, useEffect, use } from 'react'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done' }
  | { kind: 'error', message: string }
  | { kind: 'not-found' }

export default function PublicReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)

  const [authorName, setAuthorName]   = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const [rating, setRating]           = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [content, setContent]         = useState('')
  const [status, setStatus]           = useState<Status>({ kind: 'idle' })

  // Detect submitter's language from their browser — purely informational,
  // used so the owner can see what language each review came in.
  const [language, setLanguage] = useState('en')
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const code = (navigator.language || 'en').toLowerCase().split('-')[0].slice(0, 8)
      setLanguage(code)
    }
  }, [])

  async function submit() {
    if (status.kind === 'submitting') return
    if (!authorName.trim())                  return setStatus({ kind: 'error', message: 'Please enter your name.' })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(authorEmail.trim())) return setStatus({ kind: 'error', message: 'Please enter a valid email.' })
    if (rating < 1 || rating > 5)            return setStatus({ kind: 'error', message: 'Please choose a rating from 1 to 5.' })
    if (!content.trim())                     return setStatus({ kind: 'error', message: 'Please write your review.' })

    setStatus({ kind: 'submitting' })

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          author_name: authorName.trim(),
          author_email: authorEmail.trim(),
          rating,
          content: content.trim(),
          language,
        }),
      })

      if (res.status === 404) return setStatus({ kind: 'not-found' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        return setStatus({ kind: 'error', message: j?.error || 'Something went wrong.' })
      }
      setStatus({ kind: 'done' })
    } catch {
      setStatus({ kind: 'error', message: 'Network error. Please try again.' })
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#fff', fontFamily: 'system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Header — only thing public about the owner is the slug. */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Leave a review for
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
            @{slug}
          </h1>
        </div>

        {status.kind === 'not-found' && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '20px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Page not found</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
              This review link doesn't exist or has been removed.
            </div>
          </div>
        )}

        {status.kind === 'done' && (
          <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 14, padding: '24px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Thank you</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
              Your review has been submitted. It will appear publicly once the owner reviews it.
            </div>
          </div>
        )}

        {status.kind !== 'done' && status.kind !== 'not-found' && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>

            {/* Rating */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your rating
              </label>
              <div style={{ display: 'flex', gap: 6 }} onMouseLeave={() => setHoverRating(0)}>
                {[1, 2, 3, 4, 5].map(n => {
                  const filled = n <= (hoverRating || rating)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', fontSize: 32, color: filled ? GOLD : 'rgba(255,255,255,0.18)', transition: 'color 0.1s' }}
                    >
                      ★
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your name
              </label>
              <input
                type="text"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                maxLength={80}
                placeholder="Jane Doe"
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your email
              </label>
              <input
                type="email"
                value={authorEmail}
                onChange={e => setAuthorEmail(e.target.value)}
                placeholder="jane@example.com"
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                Only shared with the person you're reviewing. Never shown publicly.
              </div>
            </div>

            {/* Review */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your review
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="Tell others about your experience…"
                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, textAlign: 'right' }}>
                {content.length} / 2000
              </div>
            </div>

            {status.kind === 'error' && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 16 }}>
                {status.message}
              </div>
            )}

            <button
              onClick={submit}
              disabled={status.kind === 'submitting'}
              style={{ width: '100%', background: BLUE, color: '#fff', fontSize: 14, fontWeight: 700, padding: '14px', borderRadius: 10, border: 'none', cursor: status.kind === 'submitting' ? 'wait' : 'pointer', opacity: status.kind === 'submitting' ? 0.6 : 1 }}
            >
              {status.kind === 'submitting' ? 'Submitting…' : 'Submit review'}
            </button>

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 14, textAlign: 'center', lineHeight: 1.5 }}>
              By submitting, you confirm this is your honest experience.
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
