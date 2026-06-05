'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

type Msg = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'How do I publish my first website?',
  'Help me plan an outreach campaign',
  'What does my plan include?',
  'How do I collect customer reviews?',
]

export default function AssistantPage() {
  const { dict, lang } = useI18n()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const content = text.trim()
    if (!content || loading) return
    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          context: { language: lang, currentPage: '/dashboard/assistant' },
        }),
      })
      const data = await res.json()
      const reply = data?.reply || data?.error || t(dict, 'assistant.error', 'Sorry, I could not answer that right now.')
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch {
      setMessages([...next, { role: 'assistant', content: t(dict, 'assistant.error', 'Sorry, I could not answer that right now.') }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 65px)', padding: 24, maxWidth: 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 16 }}>
        <span className="sb-eyebrow">Assistant</span>
        <h1 className="sb-h2" style={{ marginTop: 8, marginBottom: 4 }}>{t(dict, 'assistant.title', 'Your SignalBoost concierge')}</h1>
        <p className="sb-body" style={{ margin: 0 }}>{t(dict, 'assistant.subtitle', 'Ask anything about building, promoting, reviews, audio, video, or your account.')}</p>
      </div>

      {/* Messages */}
      <div className="sb-card" style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !loading && (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 520 }}>
            <div style={{ fontSize: 40 }}>✨</div>
            <p className="sb-body" style={{ marginTop: 8 }}>{t(dict, 'assistant.empty', 'Ask me anything, or start with one of these:')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className="sb-button-secondary" style={{ fontSize: 13 }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: 16,
              borderTopRightRadius: m.role === 'user' ? 4 : 16,
              borderTopLeftRadius: m.role === 'user' ? 16 : 4,
              background: m.role === 'user' ? 'rgba(255,195,0,.14)' : 'rgba(255,255,255,.05)',
              border: `1px solid ${m.role === 'user' ? 'rgba(255,195,0,.3)' : 'rgba(255,255,255,.1)'}`,
              color: '#fff',
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '12px 16px', borderRadius: 16, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)', fontSize: 14 }}>
              {t(dict, 'assistant.thinking', 'Thinking…')}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <input
          className="sb-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(input) }}
          placeholder={t(dict, 'assistant.placeholder', 'Ask the concierge…')}
          style={{ flex: 1, padding: 14 }}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{ background: GOLD, color: '#000', border: 'none', borderRadius: 12, padding: '0 24px', fontWeight: 800, cursor: loading ? 'wait' : 'pointer', opacity: loading || !input.trim() ? 0.6 : 1 }}
        >
          {t(dict, 'assistant.send', 'Send')}
        </button>
      </div>
    </main>
  )
}
