'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const COPY = {
  en: {
    label: 'AI Concierge',
    title: 'AI Concierge',
    intro:
      "Hi, I'm your SignalBoost concierge. I can help with videos, credits, pricing, reviews, outreach, and support.",
  },
}

export default function Concierge() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const { lang } = useI18n()
  const copy = COPY.en

  async function action(type: string) {
    if (type === 'video') {
      setMessage(
        '🎥 Video Studio helps create AI videos and shorts.'
      )
    }

    if (type === 'credits') {
      fetch('/api/credits')
        .then((r) => r.json())
        .then((data) => {
          setMessage(
            `⚡ You have ${data.credits} credits (${data.plan} plan)`
          )
        })
        .catch(() => {
          setMessage(
            '⚡ Unable to load credits'
          )
        })
    }

    if (type === 'growth') {
      setMessage(
        '📈 Growth tools help with outreach, reviews and traffic.'
      )
    }

    if (type === 'support') {
      try {
        setLoading(true)

        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content:
                  'Give me a short welcome and ask how you can help.',
              },
            ],
            context: {
              language: lang,
              currentPage: 'concierge',
            },
          }),
        })

        const data = await response.json()

        setMessage(
          data.reply ||
            '💬 Support connected.'
        )
      } catch {
        setMessage(
          '💬 Unable to connect.'
        )
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position:'fixed',
          right:30,
          bottom:30,
          zIndex:999999,
          border:'none',
          cursor:'pointer',
          display:'flex',
          alignItems:'center',
          gap:10,
          padding:'14px 18px',
          borderRadius:999,
          background:
            'linear-gradient(135deg,#ffc300,#ff9500)',
          color:'#111',
          fontWeight:800,
        }}
      >
        ✨ {copy.label}
      </button>

      {open && (
        <div
          style={{
            position:'fixed',
            right:30,
            bottom:105,
            zIndex:999999,
            width:380,
            borderRadius:24,
            background:'rgba(15,15,20,.96)',
            color:'white',
            padding:24,
          }}
        >
          <div
            style={{
              display:'flex',
              justifyContent:'space-between',
              marginBottom:16,
            }}
          >
            <strong>{copy.title}</strong>

            <button
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div
            style={{
              padding:16,
              borderRadius:16,
              background:
                'rgba(255,255,255,.08)',
              marginBottom:16,
            }}
          >
            {loading
              ? 'Thinking...'
              : message || copy.intro}
          </div>

          <div
            style={{
              display:'flex',
              flexWrap:'wrap',
              gap:8,
            }}
          >
            <button onClick={() => action('video')}>
              🎥 Videos
            </button>

            <button onClick={() => action('credits')}>
              ⚡ Credits
            </button>

            <button onClick={() => action('growth')}>
              📈 Growth
            </button>

            <button onClick={() => action('support')}>
              💬 Support
            </button>
          </div>
        </div>
      )}
    </>
  )
}
