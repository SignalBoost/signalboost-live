'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const COPY = {
  en: {
    label: 'AI Concierge',
    title: 'AI Concierge',
    intro:
      "Hi, I'm your SignalBoost concierge. I can help with videos, credits, pricing, reviews, outreach, and support.",
    videos: '🎥 Videos',
    credits: '⚡ Credits',
    growth: '📈 Growth',
    support: '💬 Support',
  },
  pt: {
    label: 'Concierge IA',
    title: 'Concierge IA',
    intro:
      'Olá, sou o concierge da SignalBoost. Posso ajudar com vídeos, créditos, preços, avaliações, divulgação e suporte.',
    videos: '🎥 Vídeos',
    credits: '⚡ Créditos',
    growth: '📈 Crescimento',
    support: '💬 Suporte',
  },
  es: {
    label: 'Conserje IA',
    title: 'Conserje IA',
    intro:
      'Hola, soy tu conserje de SignalBoost. Puedo ayudarte con videos, créditos, precios, reseñas, alcance y soporte.',
    videos: '🎥 Videos',
    credits: '⚡ Créditos',
    growth: '📈 Crecimiento',
    support: '💬 Soporte',
  },
  pl: {
    label: 'Konsjerż AI',
    title: 'Konsjerż AI',
    intro:
      'Cześć, jestem konsjerżem SignalBoost. Pomogę z filmami, kredytami, cenami, opiniami, promocją i wsparciem.',
    videos: '🎥 Wideo',
    credits: '⚡ Kredyty',
    growth: '📈 Wzrost',
    support: '💬 Wsparcie',
  },
  ru: {
    label: 'AI-консьерж',
    title: 'AI-консьерж',
    intro:
      'Здравствуйте, я консьерж SignalBoost. Я помогу с видео, кредитами, тарифами, отзывами, продвижением и поддержкой.',
    videos: '🎥 Видео',
    credits: '⚡ Кредиты',
    growth: '📈 Рост',
    support: '💬 Поддержка',
  },
}

export default function Concierge() {
  const [open, setOpen] = useState(false)
  const { lang } = useI18n()

  const copy =
    COPY[lang as keyof typeof COPY] || COPY.en

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.label}
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
          background: 'linear-gradient(135deg,#ffc300,#ff9500)',
          color: '#111',
          fontSize: 16,
          fontWeight: 800,
          boxShadow: '0 10px 35px rgba(0,0,0,.35)',
        }}
      >
        <span style={{ fontSize: 26 }}>✨</span>
        <span>{copy.label}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={copy.title}
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
            boxShadow: '0 20px 60px rgba(0,0,0,.45)',
            border: '1px solid rgba(255,255,255,.15)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>SignalBoost</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {copy.title}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 24,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,.08)',
              padding: 16,
              borderRadius: 16,
              marginBottom: 16,
              lineHeight: 1.45,
            }}
          >
            {copy.intro}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[copy.videos, copy.credits, copy.growth, copy.support].map(
              (label) => (
                <button
                  key={label}
                  type="button"
                  style={{
                    border: '1px solid rgba(255,255,255,.18)',
                    background: 'rgba(255,255,255,.08)',
                    color: 'white',
                    borderRadius: 999,
                    padding: '9px 12px',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
