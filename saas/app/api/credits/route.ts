'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type CreditData = {
  credits: number
  plan: string
  name: string | null
}

const COPY = {
  en: {
    label: 'AI Concierge',
    title: 'AI Concierge',
    intro:
      "Hi, I'm your SignalBoost concierge. I can help with videos, credits, pricing, reviews, outreach, and support.",
    creditLoading: 'Checking your credits...',
    creditError:
      'I could not read your credits yet. Please make sure you are logged in.',
  },
  pt: {
    label: 'Concierge IA',
    title: 'Concierge IA',
    intro:
      'Olá, sou o concierge da SignalBoost. Posso ajudar com vídeos, créditos, preços, avaliações, divulgação e suporte.',
    creditLoading: 'Verificando seus créditos...',
    creditError:
      'Ainda não consegui ler seus créditos. Confirme que você está conectado.',
  },
  es: {
    label: 'Conserje IA',
    title: 'Conserje IA',
    intro:
      'Hola, soy tu conserje de SignalBoost. Puedo ayudarte con videos, créditos, precios, reseñas, alcance y soporte.',
    creditLoading: 'Revisando tus créditos...',
    creditError:
      'No pude leer tus créditos todavía. Asegúrate de haber iniciado sesión.',
  },
  pl: {
    label: 'Konsjerż AI',
    title: 'Konsjerż AI',
    intro:
      'Cześć, jestem konsjerżem SignalBoost. Pomogę z filmami, kredytami, promocją i wsparciem.',
    creditLoading: 'Sprawdzam Twoje kredyty...',
    creditError:
      'Nie mogę jeszcze odczytać kredytów. Upewnij się, że jesteś zalogowany.',
  },
  ru: {
    label: 'AI-консьерж',
    title: 'AI-консьерж',
    intro:
      'Здравствуйте, я консьерж SignalBoost. Помогу с видео, кредитами, продвижением и поддержкой.',
    creditLoading: 'Проверяю ваши кредиты...',
    creditError:
      'Пока не удалось прочитать кредиты. Убедитесь, что вы вошли в аккаунт.',
  },
}

export default function Concierge() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [loadingCredits, setLoadingCredits] = useState(false)
  const { lang } = useI18n()

  const copy =
    COPY[lang as keyof typeof COPY] || COPY.en

  async function checkCredits() {
    setLoadingCredits(true)
    setMessage(copy.creditLoading)

    try {
      const res = await fetch('/api/credits', {
        method: 'GET',
        credentials: 'include',
      })

      if (!res.ok) {
        setMessage(copy.creditError)
        return
      }

      const data = (await res.json()) as CreditData

      const displayName = data.name
        ? `${data.name}, `
        : ''

      setMessage(
        `${displayName}you have ${data.credits} credits on the ${data.plan} plan.`
      )
    } catch {
      setMessage(copy.creditError)
    } finally {
      setLoadingCredits(false)
    }
  }

  function action(type: string) {
    if (type === 'video') {
      setMessage(
        '🎥 Video Studio helps create AI videos and shorts.'
      )
    }

    if (type === 'credits') {
      checkCredits()
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
            boxShadow:
              '0 20px 60px rgba(0,0,0,.45)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <strong>{copy.title}</strong>

            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: 22,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background:
                'rgba(255,255,255,.08)',
              marginBottom: 16,
              lineHeight: 1.45,
            }}
          >
            {message || copy.intro}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => action('video')}
            >
              🎥 Videos
            </button>

            <button
              type="button"
              onClick={() => action('credits')}
              disabled={loadingCredits}
            >
              ⚡ Credits
            </button>

            <button
              type="button"
              onClick={() => action('growth')}
            >
              📈 Growth
            </button>

            <button
              type="button"
              onClick={() => action('support')}
            >
              💬 Support
            </button>
          </div>
        </div>
      )}
    </>
  )
}
