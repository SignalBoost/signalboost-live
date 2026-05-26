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
  pt: {
    label: 'Concierge IA',
    title: 'Concierge IA',
    intro:
      'Olá, sou o concierge da SignalBoost. Posso ajudar com vídeos, créditos, preços, avaliações, divulgação e suporte.',
  },
  es: {
    label: 'Conserje IA',
    title: 'Conserje IA',
    intro:
      'Hola, soy tu conserje de SignalBoost. Puedo ayudarte con videos, créditos, precios, reseñas, alcance y soporte.',
  },
  pl: {
    label: 'Konsjerż AI',
    title: 'Konsjerż AI',
    intro:
      'Cześć, jestem konsjerżem SignalBoost. Pomogę z filmami, kredytami, promocją i wsparciem.',
  },
  ru: {
    label: 'AI-консьерж',
    title: 'AI-консьерж',
    intro:
      'Здравствуйте, я консьерж SignalBoost. Помогу с видео, кредитами, продвижением и поддержкой.',
  },
}

export default function Concierge() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const { lang } = useI18n()

  const copy =
    COPY[lang as keyof typeof COPY] || COPY.en

  function action(type: string) {
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
      setMessage(
        '💬 Support will connect directly to SignalBoost help and routing.'
      )
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 30,
          bottom: 30,
          zIndex: 999999,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 18px',
          borderRadius: 999,
          background:
            'linear-gradient(135deg,#ffc300,#ff9500)',
          color: '#111',
          fontWeight: 800,
          boxShadow:
            '0 10px 35px rgba(0,0,0,.35)',
        }}
      >
        <span style={{ fontSize: 26 }}>✨</span>
        <span>{copy.label}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            right: 30,
            bottom: 105,
            zIndex: 999999,
            width: 380,
            maxWidth: 'calc(100vw - 40px)',
            borderRadius: 24,
            background: 'rgba(15,15,20,.96)',
            color: 'white',
            padding: 24,
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
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background:'transparent',
                border:'none',
                color:'white',
                fontSize:22,
                cursor:'pointer',
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              padding:16,
              borderRadius:16,
              background:'rgba(255,255,255,.08)',
              marginBottom:16,
            }}
          >
            {message || copy.intro}
          </div>

          <div
            style={{
              display:'flex',
              flexWrap:'wrap',
              gap:8,
            }}
          >
            <button type="button" onClick={() => action('video')}>
              🎥 Videos
            </button>

            <button type="button" onClick={() => action('credits')}>
              ⚡ Credits
            </button>

            <button type="button" onClick={() => action('growth')}>
              📈 Growth
            </button>

            <button type="button" onClick={() => action('support')}>
              💬 Support
            </button>
          </div>
        </div>
      )}
    </>
  )
}
