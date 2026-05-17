'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

type Feedback = {
  id: string
  rating: number
  category: string
  message: string
  page: string
  status: string
  created_at: string
  user_id: string
}

const CATEGORIES = [
  { id: 'praise',  icon: '🎉', label: 'Praise',          desc: 'Something you love about SignalBoost' },
  { id: 'feature', icon: '💡', label: 'Feature request', desc: 'Something you wish SignalBoost could do' },
  { id: 'bug',     icon: '🐛', label: 'Bug report',      desc: 'Something that is not working correctly' },
  { id: 'general', icon: '💬', label: 'General',         desc: 'Anything else on your mind' },
]

const STATUS_COLORS: Record<string, string> = {
  new:       'rgba(255,255,255,0.3)',
  reviewing: '#ffc300',
  planned:   '#3b82f6',
  done:      '#4ade80',
}

const STATUS_LABELS: Record<string, string> = {
  new:       'New',
  reviewing: 'Under review',
  planned:   'Planned',
  done:      'Done',
}

export default function FeedbackPage() {
  const [tab, setTab] = useState<'submit' | 'board'>('submit')
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([])
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [filterCategory, setFilterCategory] = useState('all')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id)
        const meta = data.user.user_metadata
        const fullName = meta?.full_name || meta?.name || ''
        setUserName(fullName.split(' ')[0] || 'there')
      }
    })
  }, [])

  useEffect(() => {
    if (tab === 'board') loadFeedback()
  }, [tab])

  async function loadFeedback() {
    setLoadingFeedback(true)
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setAllFeedback(data)
    setLoadingFeedback(false)
  }

  async function handleSubmit() {
    if (!message.trim() || !category || rating === 0) return
    setSubmitting(true)
    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      rating,
      category,
      message: message.trim(),
      page: window.location.pathname,
      status: 'new',
    })
    if (!error) {
      setSubmitted(true)
      setMessage('')
      setRating(0)
      setCategory('')
    }
    setSubmitting(false)
  }

  function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (mins > 0) return `${mins}m ago`
    return 'Just now'
  }

  const filtered = filterCategory === 'all'
    ? allFeedback
    : allFeedback.filter(f => f.category === filterCategory)

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>💬 Feedback</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          Help us build SignalBoost better. Your feedback goes directly to Luis.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'submit', label: '✍️ Submit feedback' },
          { id: 'board',  label: `📋 Feedback board ${allFeedback.length > 0 ? `(${allFeedback.length})` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t.id ? BLUE : 'transparent', color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.45)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Submit */}
      {tab === 'submit' && (
        <div style={{ maxWidth: 580 }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>Thank you{userName ? `, ${userName}` : ''}!</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                Your feedback has been received. Luis reads every single submission personally.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => setSubmitted(false)}
                  style={{ background: BLUE, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                  Submit more feedback
                </button>
                <button onClick={() => { setSubmitted(false); setTab('board'); loadFeedback() }}
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                  View feedback board
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Rating */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 12 }}>
                  How would you rate SignalBoost overall? *
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      style={{
                        width: 48, height: 48, borderRadius: 12, border: 'none', cursor: 'pointer',
                        fontSize: 24, background: (hoveredRating || rating) >= star ? 'rgba(255,195,0,0.15)' : 'rgba(255,255,255,0.03)',
                        transition: 'all 0.15s',
                      }}>
                      {(hoveredRating || rating) >= star ? '★' : '☆'}
                    </button>
                  ))}
                  {rating > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 8, fontSize: 13, color: GOLD, fontWeight: 600 }}>
                      {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][rating]}
                    </div>
                  )}
                </div>
              </div>

              {/* Category */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 12 }}>
                  What kind of feedback is this? *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {CATEGORIES.map(cat => (
                    <div key={cat.id} onClick={() => setCategory(cat.id)}
                      style={{
                        padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                        background: category === cat.id ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${category === cat.id ? BLUE : 'rgba(255,255,255,0.07)'}`,
                        transition: 'all 0.15s',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{cat.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{cat.label}</span>
                        {category === cat.id && <span style={{ marginLeft: 'auto', color: BLUE }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{cat.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  Your feedback *
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={
                    category === 'bug' ? 'Describe what happened and what you expected to happen...' :
                    category === 'feature' ? 'Describe the feature you would like to see...' :
                    category === 'praise' ? 'Tell us what you love about SignalBoost...' :
                    'Share your thoughts...'
                  }
                  rows={5}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: 14, outline: 'none',
                    boxSizing: 'border-box', resize: 'vertical', fontFamily: 'system-ui', lineHeight: 1.6,
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
                  {message.length} characters
                </div>
              </div>

              {/* Notice */}
              <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.15)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                💡 Your feedback is visible to other SignalBoost users on the feedback board. This helps everyone see what is being worked on. Do not include personal or sensitive information.
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim() || !category || rating === 0}
                style={{
                  background: (!message.trim() || !category || rating === 0) ? 'rgba(255,255,255,0.05)' : GOLD,
                  color: (!message.trim() || !category || rating === 0) ? 'rgba(255,255,255,0.3)' : '#000',
                  fontWeight: 800, fontSize: 14, padding: '13px 36px',
                  borderRadius: 999, border: 'none',
                  cursor: (!message.trim() || !category || rating === 0) ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                }}>
                {submitting ? 'Submitting...' : 'Submit feedback'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Board */}
      {tab === 'board' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Community feedback</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ id: 'all', label: 'All' }, ...CATEGORIES.map(c => ({ id: c.id, label: c.icon + ' ' + c.label }))].map(f => (
                <button key={f.id} onClick={() => setFilterCategory(f.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    background: filterCategory === f.id ? BLUE : 'rgba(255,255,255,0.05)',
                    color: filterCategory === f.id ? '#fff' : 'rgba(255,255,255,0.45)',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loadingFeedback ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)' }}>Loading feedback...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No feedback yet</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>Be the first to share your thoughts!</div>
              <button onClick={() => setTab('submit')}
                style={{ background: BLUE, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Submit feedback
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(item => {
                const cat = CATEGORIES.find(c => c.id === item.category)
                const isOwn = item.user_id === userId
                return (
                  <div key={item.id} style={{
                    background: isOwn ? 'rgba(59,130,246,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isOwn ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: 14, padding: '18px 20px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 18 }}>{cat?.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat?.label}</span>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {[1,2,3,4,5].map(s => (
                            <span key={s} style={{ fontSize: 12, color: s <= item.rating ? GOLD : 'rgba(255,255,255,0.15)' }}>★</span>
                          ))}
                        </div>
                        {isOwn && <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 999, padding: '2px 8px' }}>You</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: STATUS_COLORS[item.status] }}>
                          {STATUS_LABELS[item.status]}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{timeAgo(item.created_at)}</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0 }}>{item.message}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
