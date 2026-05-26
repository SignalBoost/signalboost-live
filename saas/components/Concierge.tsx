'use client'

import { useMemo, useState } from 'react'

type ConciergeMessage = {
  role: 'assistant' | 'user'
  text: string
}

export default function Concierge() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ConciergeMessage[]>([
    {
      role: 'assistant',
      text: 'Hi, I’m your SignalBoost concierge. I can help with videos, credits, pricing, support, reviews, outreach, and what to do next.',
    },
  ])

  const quickActions = useMemo(
    () => [
      'What should I do next?',
      'Check my credits',
      'Help me make a video',
      'Explain my plan',
      'Contact support',
    ],
    []
  )

  function sendMessage(text?: string) {
    const value = (text || input).trim()
    if (!value) return

    setMessages((current) => [
      ...current,
      { role: 'user', text: value },
      {
        role: 'assistant',
        text: getLocalReply(value),
      },
    ])

    setInput('')
  }

  function getLocalReply(value: string) {
    const lower = value.toLowerCase()

    if (lower.includes('credit')) {
      return 'I can help you check credits. Next version will connect directly to your credits API so I can show your exact balance here.'
    }

    if (lower.includes('video')) {
      return 'To make a video, go to the Lab or Video page, choose your idea, and generate. Soon I’ll be able to start that flow for you directly.'
    }

    if (lower.includes('plan') || lower.includes('pricing')) {
      return 'I can explain plans and recommend the best one based on usage. Soon I’ll read your current plan automatically.'
    }

    if (lower.includes('support') || lower.includes('help')) {
      return 'I can route this to support. Soon this panel will connect to the support API and email system.'
    }

    return 'I’m here to guide the user through SignalBoost. Next I’ll be connected to the real support/router APIs so I can answer with live product context and take actions.'
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open SignalBoost concierge"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 80,
          width: 64,
          height: 64,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.28)',
          background:
            'linear-gradient(135deg, rgba(255,195,0,0.95), rgba(255,145,0,0.95))',
          color: '#111827',
          boxShadow: '0 18px 45px rgba(0,0,0,0.28)',
          cursor: 'pointer',
          fontSize: 28,
          fontWeight: 900,
        }}
      >
        ✨
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="SignalBoost concierge"
          style={{
            position: 'fixed',
            right: 20,
            bottom: 96,
            zIndex: 90,
            width: 'min(420px, calc(100vw - 32px))',
            maxHeight: 'min(680px, calc(100vh - 128px))',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.20)',
            background: 'rgba(10, 15, 25, 0.92)',
            color: 'white',
            boxShadow: '0 24px 70px rgba(0,0,0,0.42)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <div
            style={{
              padding: '18px 18px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 15, opacity: 0.72 }}>SignalBoost</div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>Concierge</div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close concierge"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.08)',
                color: 'white',
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              padding: 16,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  alignSelf:
                    message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  padding: '11px 13px',
                  borderRadius:
                    message.role === 'user'
                      ? '16px 16px 4px 16px'
                      : '16px 16px 16px 4px',
                  background:
                    message.role === 'user'
                      ? 'rgba(255,195,0,0.95)'
                      : 'rgba(255,255,255,0.10)',
                  color: message.role === 'user' ? '#111827' : 'white',
                  fontSize: 14,
                  lineHeight: 1.45,
                }}
              >
                {message.text}
              </div>
            ))}

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                paddingTop: 4,
              }}
            >
              {quickActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => sendMessage(action)}
                  style={{
                    border: '1px solid rgba(255,255,255,0.16)',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'white',
                    borderRadius: 999,
                    padding: '8px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              sendMessage()
            }}
            style={{
              padding: 14,
              borderTop: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              gap: 8,
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask your concierge..."
              style={{
                flex: 1,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(255,255,255,0.10)',
                color: 'white',
                borderRadius: 999,
                padding: '11px 13px',
                outline: 'none',
              }}
            />

            <button
              type="submit"
              style={{
                border: 0,
                background: '#ffc300',
                color: '#111827',
                borderRadius: 999,
                padding: '0 16px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Send
            </button>
          </form>
        </div>
      ) : null}
    </>
  )
}
