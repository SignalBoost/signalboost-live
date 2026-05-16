'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/utils/supabase/client'
import { usePathname } from 'next/navigation'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type UserContext = {
  name: string
  email: string
  plan: string
  page: string
  timeOnPage: number
  clickCount: number
  errorCount: number
  lastError: string
}

const SUGGESTED = [
  'How do I add a new language?',
  'What is included in the Pro plan?',
  'How do I upload a podcast episode?',
  'How do I generate captions?',
]

export default function SupportChat() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [pulsing, setPulsing] = useState(false)
  const [proactiveTriggered, setProactiveTriggered] = useState(false)
  const [userCtx, setUserCtx] = useState<UserContext>({
    name: '', email: '', plan: 'free',
    page: pathname || '/',
    timeOnPage: 0, clickCount: 0, errorCount: 0, lastError: '',
  })
  const bottomRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef(0)
  const clickRef = useRef(0)
  const errorRef = useRef(0)
  const lastErrorRef = useRef('')
  const timerRef = useRef<NodeJS.Timeout>()

  // Get user info
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const meta = data.user.user_metadata
        const fullName = meta?.full_name || meta?.name || ''
        const name = fullName.split(' ')[0] || ''
        const email = data.user.email || ''
        setUserCtx(prev => ({ ...prev, name, email }))

        // Get plan
        supabase.from('subscriptions').select('plan').eq('user_id', data.user.id).single()
          .then(({ data: sub }) => {
            if (sub?.plan) setUserCtx(prev => ({ ...prev, plan: sub.plan }))
          })
      }
    })
  }, [])

  // Track page
  useEffect(() => {
    setUserCtx(prev => ({ ...prev, page: pathname || '/' }))
    timeRef.current = 0
    setProactiveTriggered(false)
  }, [pathname])

  // Track time on page
  useEffect(() => {
    timerRef.current = setInterval(() => {
      timeRef.current += 1
      setUserCtx(prev => ({ ...prev, timeOnPage: timeRef.current }))

      // Proactive trigger: stuck for 3 minutes on dashboard/builder
      if (
        timeRef.current === 180 &&
        !proactiveTriggered &&
        !open &&
        (pathname?.includes('dashboard') || pathname?.includes('builder'))
      ) {
        triggerProactive('time')
      }
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [pathname, proactiveTriggered, open])

  // Track clicks
  useEffect(() => {
    const handleClick = () => {
      clickRef.current += 1
      setUserCtx(prev => ({ ...prev, clickCount: clickRef.current }))

      // Proactive trigger: clicking a lot without progress
      if (clickRef.current > 15 && !proactiveTriggered && !open) {
        triggerProactive('clicks')
      }
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [proactiveTriggered, open])

  // Track errors
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      errorRef.current += 1
      lastErrorRef.current = e.message
      setUserCtx(prev => ({ ...prev, errorCount: errorRef.current, lastError: e.message }))
      if (!proactiveTriggered && !open) triggerProactive('error')
    }
    window.addEventListener('error', handleError)
    return () => window.removeEventListener('error', handleError)
  }, [proactiveTriggered, open])

  function triggerProactive(reason: 'time' | 'clicks' | 'error') {
    setProactiveTriggered(true)
    setPulsing(true)
    setTimeout(() => setPulsing(false), 5000)

    const ctx = buildContext()
    let proactiveMsg = ''

    if (reason === 'error') {
      proactiveMsg = `I noticed an error occurred on the ${getPageName(pathname)} page. Let me help you fix this right away — no need to explain anything, I already have the full context.`
    } else if (reason === 'clicks') {
      proactiveMsg = `Hey${userCtx.name ? ' ' + userCtx.name : ''}! I noticed you have been clicking around on the ${getPageName(pathname)} page. Are you having trouble finding something? I already know your account details so we can solve this quickly.`
    } else {
      proactiveMsg = `Hey${userCtx.name ? ' ' + userCtx.name : ''}! I noticed you have been on the ${getPageName(pathname)} page for a few minutes. Need help with anything? I already have your full context so no need to explain from scratch.`
    }

    setMessages([{ role: 'assistant', content: proactiveMsg }])
    setUnread(1)

    // Auto-open after 1 second
    setTimeout(() => {
      setOpen(true)
      setUnread(0)
    }, 1000)
  }

  function getPageName(path: string | null) {
    if (!path) return 'this'
    if (path.includes('builder')) return 'Site Builder'
    if (path.includes('reviews')) return 'Review Collector'
    if (path.includes('audio')) return 'Native Audio'
    if (path.includes('video')) return 'Video Editor'
    if (path.includes('dashboard')) return 'Dashboard'
    if (path.includes('pricing')) return 'Pricing'
    if (path.includes('podcasters')) return 'Podcasters'
    return 'this'
  }

  function buildContext() {
    return {
      userName: userCtx.name,
      userEmail: userCtx.email,
      userPlan: userCtx.plan,
      currentPage: getPageName(pathname),
      timeOnPageSeconds: timeRef.current,
      clickCount: clickRef.current,
      errorCount: errorRef.current,
      lastError: lastErrorRef.current,
    }
  }

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Hi${userCtx.name ? ' ' + userCtx.name : ''}! I am the SignalBoost support assistant. I can see you are on the ${getPageName(pathname)} page. What can I help you with today?`,
      }])
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!open && messages.length > 1) {
      const last = messages[messages.length - 1]
      if (last.role === 'assistant') setUnread(n => n + 1)
    }
  }, [messages])

  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  async function send(text?: string) {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')

    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          context: buildContext(),
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I am having trouble connecting right now. Please email cadomos@gmail.com and Luis will help you personally.',
      }])
    }
    setLoading(false)
  }

  return (
    <>
      <style>{`
        @keyframes chatIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 24px rgba(59,130,246,0.5); transform: scale(1); }
          50% { box-shadow: 0 4px 48px rgba(59,130,246,0.9); transform: scale(1.12); }
        }
        @keyframes typingBounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {/* Chat bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
          animation: pulsing ? 'pulse 1s ease-in-out infinite' : 'none',
          boxShadow: '0 4px 24px rgba(59,130,246,0.5)',
          transition: 'transform 0.2s',
        }}
      >
        {open ? '✕' : '💬'}
        {!open && unread > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 20, height: 20, borderRadius: '50%',
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread}
          </div>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 92, right: 24, zIndex: 998,
          width: 360, height: 520,
          background: '#111118',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          fontFamily: 'system-ui',
          animation: 'chatIn 0.2s ease-out',
          color: '#fff',
        }}>

          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, flexShrink: 0,
            }}>⚡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>SignalBoost Support</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                AI-powered · Always online
              </div>
            </div>
            {userCtx.plan && (
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,195,0,0.8)', background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase' }}>
                {userCtx.plan}
              </div>
            )}
          </div>

          {/* Context bar */}
          <div style={{
            padding: '6px 16px',
            background: 'rgba(59,130,246,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            fontSize: 10, color: 'rgba(255,255,255,0.35)',
            display: 'flex', gap: 12,
          }}>
            <span>📍 {getPageName(pathname)}</span>
            {userCtx.name && <span>👤 {userCtx.name}</span>}
            <span>⏱ {Math.floor(timeRef.current / 60)}m {timeRef.current % 60}s</span>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                    : 'rgba(255,255,255,0.06)',
                  border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.4)',
                      animation: `typingBounce 1s ease-in-out ${i * 0.15}s infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>Quick questions</div>
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => send(q)}
                    style={{
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      borderRadius: 10, padding: '8px 12px',
                      color: 'rgba(255,255,255,0.7)', fontSize: 12,
                      cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.18)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.08)')}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask anything..."
              style={{
                flex: 1, padding: '10px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: input.trim() && !loading ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                color: '#fff', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}>
              ↑
            </button>
          </div>

          <div style={{ textAlign: 'center', padding: '4px 0 10px', fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
            Powered by SignalBoost AI ·{' '}
            <a href="mailto:cadomos@gmail.com" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>
              Contact Luis directly
            </a>
          </div>
        </div>
      )}
    </>
  )
}
