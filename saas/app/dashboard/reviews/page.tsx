'use client'

import { useState, useEffect, useCallback } from 'react'

const GREEN = '#4ade80'
const RED = '#f87171'

type Review = {
  id: string
  author_name: string
  author_email: string
  rating: number
  content: string
  language: string
  approved: boolean
  created_at: string
}

type SlugState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'set', slug: string }

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewsError, setReviewsError] = useState<string | null>(null)

  const [slug, setSlug] = useState<SlugState>({ kind: 'loading' })
  const [slugDraft, setSlugDraft] = useState('')
  const [slugSaving, setSlugSaving] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all')

  // Load slug
  useEffect(() => {
    let cancelled = false
    fetch('/api/profile/slug')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (j?.slug) setSlug({ kind: 'set', slug: j.slug })
        else setSlug({ kind: 'none' })
      })
      .catch(() => { if (!cancelled) setSlug({ kind: 'none' }) })
    return () => { cancelled = true }
  }, [])

  // Load reviews
  const loadReviews = useCallback(async () => {
    setReviewsLoading(true)
    setReviewsError(null)
    try {
      const res = await fetch('/api/reviews')
      if (res.status === 401) {
        setReviewsError('Please sign in to see your reviews.')
        setReviews([])
        return
      }
      const j = await res.json()
      if (!res.ok) {
        setReviewsError(j?.error || 'Could not load reviews.')
        return
      }
      setReviews(j.reviews ?? [])
    } catch {
      setReviewsError('Could not load reviews.')
    } finally {
      setReviewsLoading(false)
    }
  }, [])

  useEffect(() => { loadReviews() }, [loadReviews])

  async function saveSlug() {
    const candidate = slugDraft.trim().toLowerCase()
    if (!candidate) { setSlugError('Pick a handle to continue.'); return }
    setSlugSaving(true)
    setSlugError(null)
    try {
      const res = await fetch('/api/profile/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: candidate }),
      })
      const j = await res.json()
      if (!res.ok) { setSlugError(j?.error || 'Could not save handle.'); return }
      setSlug({ kind: 'set', slug: j.slug })
      setSlugDraft('')
    } catch {
      setSlugError('Could not save handle.')
    } finally {
      setSlugSaving(false)
    }
  }

  async function toggleApprove(id: string, current: boolean) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, approved: !current } : r))
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: !current }),
      })
      if (!res.ok) {
        setReviews(prev => prev.map(r => r.id === id ? { ...r, approved: current } : r))
      }
    } catch {
      setReviews(prev => prev.map(r => r.id === id ? { ...r, approved: current } : r))
    }
  }

  async function deleteReview(id: string) {
    if (!confirm('Delete this review? This cannot be undone.')) return
    const snapshot = reviews
    setReviews(prev => prev.filter(r => r.id !== id))
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) setReviews(snapshot)
    } catch {
      setReviews(snapshot)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reviewLink = slug.kind === 'set'
    ? `https://saas.signalboostapp.com/review/${slug.slug}`
    : ''

  const approvedCount = reviews.filter(r => r.approved).length
  const pendingCount = reviews.length - approvedCount
  const avgRating = approvedCount
    ? reviews.filter(r => r.approved).reduce((sum, r) => sum + r.rating, 0) / approvedCount
    : 0

  const visibleReviews = reviews.filter(r => {
    if (filter === 'pending') return !r.approved
    if (filter === 'approved') return r.approved
    return true
  })

  function fmtDate(iso: string): string {
    try { return new Date(iso).toISOString().slice(0, 10) } catch { return '' }
  }

  // === Token-based styles ===
  // All surfaces use the new globals.css tokens so iterating the look
  // is a single-file change in globals.css.
  const card: React.CSSProperties = {
    background: 'var(--surface-1)',
    border: '1px solid var(--border-medium)',
    borderRadius: 14,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  }

  const input: React.CSSProperties = {
    background: 'var(--surface-3)',
    border: '1px solid var(--border-medium)',
    borderRadius: 8,
    padding: '10px 14px',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
  }

  return (
    <div style={{ color: 'var(--text-primary)', fontFamily: 'system-ui', maxWidth: 880, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>⭐ Review collector</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, margin: '6px 0 0' }}>
          Share one link. Customers leave reviews in their own language. You approve what shows up publicly.
        </p>
      </div>

      {reviewsError && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12,
          padding: '12px 16px',
          fontSize: 13,
          color: RED,
          marginBottom: 20,
        }}>
          {reviewsError}
        </div>
      )}
      {/* === SECTION 1: Your review link === */}
      <section style={{ ...card, padding: '24px 26px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
          Send this link to your customers
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>
          They click it, leave a review in their own language, and it appears below as Pending until you approve it.
        </p>

        {slug.kind === 'loading' && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
        )}

        {slug.kind === 'none' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Pick a handle for your review link. It can be your name, your business, anything — 3 to 30 lowercase letters, digits, and hyphens.
            </p>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-medium)', background: 'var(--surface-3)' }}>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-soft)' }}>
                signalboostapp.com/review/
              </span>
              <input
                type="text"
                value={slugDraft}
                onChange={e => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="your-handle"
                maxLength={30}
                onKeyDown={e => e.key === 'Enter' && saveSlug()}
                style={{ flex: 1, background: 'transparent', border: 'none', padding: '12px 14px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
              <button
                onClick={saveSlug}
                disabled={slugSaving || !slugDraft.trim()}
                style={{ background: 'var(--blue)', color: '#fff', fontSize: 13, fontWeight: 700, padding: '0 22px', border: 'none', cursor: slugSaving || !slugDraft.trim() ? 'not-allowed' : 'pointer', opacity: slugSaving || !slugDraft.trim() ? 0.6 : 1 }}
              >
                {slugSaving ? 'Saving…' : 'Claim'}
              </button>
            </div>
            {slugError && (
              <div style={{ fontSize: 12, color: RED, marginTop: 10 }}>{slugError}</div>
            )}
          </div>
        )}

        {slug.kind === 'set' && (
          <div>
            <div style={{
              background: 'var(--surface-3)',
              border: '1px solid var(--border-medium)',
              borderRadius: 10,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
            }}>
              <span style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {reviewLink}
              </span>
              <button onClick={() => copyToClipboard(reviewLink)}
                style={{
                  background: copied ? GREEN : 'var(--blue)',
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  padding: '9px 18px', borderRadius: 8, border: 'none',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'background 0.15s',
                }}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <a href={reviewLink} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>
                Open in new tab ↗
              </a>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>·</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                Handle: <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-secondary)' }}>{slug.slug}</code>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* === SECTION 2: Reviews feed === */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Your reviews</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {reviewsLoading ? 'Loading…' : (
                reviews.length === 0
                  ? 'Nothing yet. Share the link above to start.'
                  : `${reviews.length} total · ${pendingCount} pending · ${approvedCount} approved${approvedCount > 0 ? ` · ${avgRating.toFixed(1)} ★ avg` : ''}`
              )}
            </p>
          </div>

          {reviews.length > 0 && (
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 999, padding: 3, border: '1px solid var(--border-soft)' }}>
              {([
                { id: 'all', label: `All (${reviews.length})` },
                { id: 'pending', label: `Pending (${pendingCount})` },
                { id: 'approved', label: `Approved (${approvedCount})` },
              ] as const).map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 999,
                    fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: filter === f.id ? 'var(--blue)' : 'transparent',
                    color: filter === f.id ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {reviewsLoading ? (
          <div style={{ ...card, padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            Loading…
          </div>
        ) : reviews.length === 0 ? (
          <div style={{ ...card, padding: '40px 24px', textAlign: 'center', borderStyle: 'dashed' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No reviews yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {slug.kind === 'set' ? 'Send your link above to a customer to receive your first review.' : 'Claim a handle above to get your review link.'}
            </div>
          </div>
        ) : visibleReviews.length === 0 ? (
          <div style={{ ...card, padding: '24px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            No {filter} reviews.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleReviews.map(review => {
              const isPending = !review.approved
              return (
                <div key={review.id}
                  style={{
                    ...card,
                    padding: '16px 20px',
                    borderColor: isPending ? 'var(--border-gold)' : 'var(--border-medium)',
                    background: isPending ? 'rgba(255,195,0,0.05)' : 'var(--surface-1)',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{review.author_name}</span>
                        <span style={{ fontSize: 14, color: 'var(--gold)' }}>
                          {'★'.repeat(review.rating)}<span style={{ color: 'var(--border-strong)' }}>{'★'.repeat(5 - review.rating)}</span>
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                          background: isPending ? 'rgba(255,195,0,0.18)' : 'rgba(74,222,128,0.15)',
                          color: isPending ? 'var(--gold)' : GREEN,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {isPending ? 'Pending' : 'Approved'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                          {review.language} · {fmtDate(review.created_at)}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.55 }}>
                        {review.content}
                      </p>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{review.author_email}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => toggleApprove(review.id, review.approved)}
                        style={{
                          padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                          background: review.approved ? 'var(--surface-3)' : GREEN,
                          color: review.approved ? 'var(--text-muted)' : '#062512',
                        }}>
                        {review.approved ? 'Unpublish' : 'Approve'}
                      </button>
                      <button onClick={() => deleteReview(review.id)}
                        title="Delete review"
                        style={{
                          padding: '8px 14px', borderRadius: 8, fontSize: 12,
                          border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer',
                          background: 'rgba(239,68,68,0.08)', color: RED, fontWeight: 600,
                        }}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
