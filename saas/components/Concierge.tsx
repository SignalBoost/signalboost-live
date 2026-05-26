'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'

const QUICK = [
  { label: '🎥 Videos', prompt: 'How do I create videos in SignalBoost?' },
  { label: '⚡ Credits', prompt: 'Explain how credits work in SignalBoost.' },
  { label: '📈 Growth', prompt: 'Give me growth ideas using SignalBoost.' },
  { label: '💬 Support', prompt: 'I need help using SignalBoost.' },
]

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export default function Concierge() {
  const pathname = usePathname()
  const { lang } = useI18n()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi, I'm your SignalBoost concierge. Ask me anything about your workspace.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function ask(text: string) {
    const content = text.trim()
    if (!content || loading) return

    const nextMessages: Message[] = [
      ...messages,
      { role: 'user', content },
    ]

    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          context: {
            currentPage: pathname,
            language: lang,
          },
        }),
      })

      const data = await res.json()

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || data.error || 'I could not generate a response.',
        },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Connection problem. Please try again.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 999999,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 18px',
          borderRadius: 999,
          background: 'linear-gradient(135deg,#ffc300,#ff9500)',
          color: '#111',
          fontWeight: 900,
          boxShadow: '0 20px 50px rgba(255,149,0,.35)',
        }}
      >
        <span style={{ fontSize: 24 }}>✨</span>
        Concierge
      </button>

      {open && (
        <div
          className="sb-card"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 100,
            zIndex: 999999,
            width: 420,
            maxWidth: 'calc(100vw - 30px)',
            padding: 20,
            color: 'white',
            borderRadius: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>SignalBoost</div>
              <strong style={{ fontSize: 18 }}>AI Concierge</strong>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close concierge"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-soft)',
                color: 'white',
                width: 34,
                height: 34,
                borderRadius: 999,
                fontSize: 20,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: 14,
            }}
          >
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  padding: '10px 12px',
                  borderRadius: 14,
                  background:
                    message.role === 'user'
                      ? 'rgba(59,130,246,.18)'
                      : 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.08)',
                  lineHeight: 1.55,
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.content}
              </div>
            ))}

            {loading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Thinking...
              </div>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            {QUICK.map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => ask(item.prompt)}
                className="sb-button-ghost"
                style={{ padding: '9px 10px', fontSize: 12 }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') ask(input)
              }}
              className="sb-input"
              style={{ flex: 1, padding: 12, minWidth: 0 }}
              placeholder="Ask anything..."
            />
            <button
              type="button"
              className="sb-button-primary"
              onClick={() => ask(input)}
              disabled={loading || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  )
}
