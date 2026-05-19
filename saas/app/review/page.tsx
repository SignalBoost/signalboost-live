'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/utils/supabase/client'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'
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
  const [tab, setTab] = useState<'overview' | 'collect' | 'manage' | 'widget'>('overview')

  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewsError, setReviewsError] = useState<string | null>(null)

  const [slug, setSlug] = useState<SlugState>({ kind: 'loading' })
  const [slugDraft, setSlugDraft] = useState('')
  const [slugSaving, setSlugSaving] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)

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
    if (!candidate) { setSlugError('Pick a slug to continue.'); return }
    setSlugSaving(true)
    setSlugError(null)
    try {
      const res = await fetch('/api/profile/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: candidate }),
      })
      const j = await res.json()
      if (!res.ok) { setSlugError(j?.error || 'Could not save slug.'); return }
      setSlug({ kind: 'set', slug: j.slug })
      setSlugDraft('')
    } catch {
      setSlugError('Could not save slug.')
    } finally {
      setSlugSaving(false)
    }
  }

  async function toggleApprove(id: string, current: boolean) {
    // optimistic
    setReviews(prev => prev.map(r => r.id === id ? { ...r, approved: !current } : r))
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: !current }),
      })
      if (!res.ok) {
        // rollback
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

  const approvedReviews = reviews.filter(r => r.approved)
  const avgRating = approvedReviews.length
    ? approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length
    : 0
  const uniqueLanguages = new Set(reviews.map(r => r.language)).size

  function fmtDate(iso: string): string {
    try { return new Date(iso).toISOString().slice(0, 10) } catch { return '' }
  }return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>⭐ Review collector</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          Collect and display customer reviews in multiple languages.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total reviews', value: reviewsLoading ? '—' : reviews.length.toString() },
          { label: 'Approved',      value: reviewsLoading ? '—' : approvedReviews.length.toString() },
          { label: 'Avg rating',    value: reviewsLoading ? '—' : (approvedReviews.length ? avgRating.toFixed(1) + ' ★' : '—') },
          { label: 'Languages',     value: reviewsLoading ? '—' : uniqueLanguages.toString() },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, fontWeight: 500 }}>{stat.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: BLUE }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'collect',  label: 'Collect reviews' },
          { id: 'manage',   label: 'Manage reviews' },
          { id: 'widget',   label: 'Embed widget' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: tab === t.id ? BLUE : 'transparent', color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.45)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {reviewsError && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: RED, marginBottom: 16 }}>
          {reviewsError}
        </div>
      )}

      {/* Overview */}
      {tab === 'overview' && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Recent reviews</h2>
          {reviewsLoading ? (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
          ) : approvedReviews.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 14, padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              No approved reviews yet. Approved reviews from your customers will appear here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {approvedReviews.map(review => (
                <div key={review.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                        {review.author_name[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{review.author_name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{review.language} · {fmtDate(review.created_at)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 16, color: GOLD }}>{'★'.repeat(review.rating)}<span style={{ color: 'rgba(255,255,255,0.15)' }}>{'★'.repeat(5 - review.rating)}</span></div>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0 }}>{review.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collect */}
      {tab === 'collect' && (
        <div style={{ maxWidth: 560 }}>

          {/* Slug picker — has to come first because the link doesn't exist without one */}
          {slug.kind === 'loading' && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Loading…</div>
          )}

          {slug.kind === 'none' && (
            <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, marginBottom: 8 }}>Choose your review handle</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 14, lineHeight: 1.5 }}>
                Your review page lives at <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4 }}>signalboostapp.com/review/<b>your-handle</b></code>. Pick anything you want — your name, your business, anything. 3–30 lowercase letters, digits, and hyphens.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={slugDraft}
                  onChange={e => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme-coffee"
                  maxLength={30}
                  style={{ flex: 1, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
                />
                <button
                  onClick={saveSlug}
                  disabled={slugSaving}
                  style={{ background: BLUE, color: '#fff', fontSize: 13, fontWeight: 700, padding: '0 18px', borderRadius: 8, border: 'none', cursor: slugSaving ? 'wait' : 'pointer', opacity: slugSaving ? 0.6 : 1 }}
                >
                  {slugSaving ? 'Saving…' : 'Claim'}
                </button>
              </div>
