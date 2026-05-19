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
  }
