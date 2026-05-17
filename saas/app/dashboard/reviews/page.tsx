'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

type Review = {
  id: string
  author: string
  rating: number
  content: string
  language: string
  date: string
  approved: boolean
}

const SAMPLE_REVIEWS: Review[] = [
  { id: '1', author: 'Maria S.', rating: 5, content: 'Excellent service! Very professional and fast.', language: 'English', date: '2026-05-10', approved: true },
  { id: '2', author: 'João P.', rating: 5, content: 'Serviço excelente! Muito profissional e rápido.', language: 'Português', date: '2026-05-09', approved: true },
  { id: '3', author: 'Carlos M.', rating: 4, content: 'Muy buen servicio, lo recomiendo totalmente.', language: 'Español', date: '2026-05-08', approved: false },
]

export default function ReviewsPage() {
  const [tab, setTab] = useState<'overview' | 'collect' | 'manage' | 'widget'>('overview')
  const [reviews, setReviews] = useState<Review[]>(SAMPLE_REVIEWS)
  const [copied, setCopied] = useState(false)
  const [userId, setUserId] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id)
    })
  }, [])

  const reviewLink = `https://saas.signalboostapp.com/review/${userId || 'your-id'}`
  const widgetCode = `<script src="https://saas.signalboostapp.com/widget.js" data-id="${userId || 'your-id'}"></script>`

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function toggleApprove(id: string) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, approved: !r.approved } : r))
  }

  function deleteReview(id: string) {
    setReviews(prev => prev.filter(r => r.id !== id))
  }

  const avgRating = reviews.filter(r => r.approved).reduce((sum, r) => sum + r.rating, 0) / (reviews.filter(r => r.approved).length || 1)

  return (
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
          { label: 'Total reviews', value: reviews.length.toString() },
          { label: 'Approved', value: reviews.filter(r => r.approved).length.toString() },
          { label: 'Avg rating', value: avgRating.toFixed(1) + ' ★' },
          { label: 'Languages', value: [...new Set(reviews.map(r => r.language))].length.toString() },
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

      {/* Overview */}
      {tab === 'overview' && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Recent reviews</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reviews.filter(r => r.approved).map(review => (
              <div key={review.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                      {review.author[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{review.author}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{review.language} · {review.date}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 16 }}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</div>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0 }}>{review.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collect */}
      {tab === 'collect' && (
        <div style={{ maxWidth: 560 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Your review link</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Share this link with your customers. They can leave a review in their own language.</p>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.7)', wordBreak: 'break-all' }}>{reviewLink}</span>
            <button onClick={() => copyToClipboard(reviewLink)}
              style={{ background: copied ? '#4ade80' : BLUE, color: '#fff', fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { icon: '📧', label: 'Send by email', desc: 'Include in your follow-up emails' },
              { icon: '📱', label: 'WhatsApp', desc: 'Share directly with customers' },
              { icon: '🖨️', label: 'Print QR code', desc: 'Add to receipts or tables' },
              { icon: '🌐', label: 'Add to website', desc: 'Use the embed widget' },
            ].map(item => (
              <div key={item.label} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage */}
      {tab === 'manage' && (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>All reviews</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.map(review => (
              <div key={review.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${review.approved ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{review.author}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{review.language}</span>
                    <span style={{ fontSize: 12 }}>{'★'.repeat(review.rating)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: review.approved ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)', color: review.approved ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>
                      {review.approved ? 'Approved' : 'Pending'}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.5 }}>{review.content}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => toggleApprove(review.id)}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: review.approved ? 'rgba(255,255,255,0.05)' : 'rgba(74,222,128,0.15)', color: review.approved ? 'rgba(255,255,255,0.5)' : '#4ade80' }}>
                    {review.approved ? 'Unpublish' : 'Approve'}
                  </button>
                  <button onClick={() => deleteReview(review.id)}
                    style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, border: 'none', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Widget */}
      {tab === 'widget' && (
        <div style={{ maxWidth: 560 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Embed on your website</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Add this code to any website to display your reviews automatically.</p>
          <div style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '16px', marginBottom: 16, position: 'relative' }}>
            <pre style={{ fontSize: 12, color: '#4ade80', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>{widgetCode}</pre>
            <button onClick={() => copyToClipboard(widgetCode)}
              style={{ position: 'absolute', top: 12, right: 12, background: BLUE, color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer' }}>
              Copy
            </button>
          </div>
          <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
            💡 Paste this code just before the closing &lt;/body&gt; tag on any page where you want reviews to appear. The widget automatically shows your approved reviews and updates in real time.
          </div>
        </div>
      )}
    </div>
  )
}
