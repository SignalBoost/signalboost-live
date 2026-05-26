'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'

const COPY = {
  en: {
    label: 'AI Concierge',
    title: 'AI Concierge',
    default:
      "Hi, I'm your SignalBoost concierge. I can help with videos, credits, pricing, reviews, outreach and support.",
    dashboard:
      'Welcome back. Want to create content or grow traffic today?',
    pricing:
      'Need help choosing the right SignalBoost plan?',
    reviews:
      'Want more reviews or help responding to customers?',
    video:
      'Need hooks, scripts, captions or voice ideas?',
    website:
      'Describe your business and I can help draft a website.',
    growth:
      'Looking to increase traffic, leads or visibility?',
    thinking: 'Thinking...',
  },

  pt: {
    label: 'Concierge IA',
    title: 'Concierge IA',
    default:
      'Olá, sou o concierge da SignalBoost. Posso ajudar com vídeos, créditos, preços, avaliações, divulgação e suporte.',
    dashboard:
      'Bem-vindo de volta. Quer criar conteúdo ou aumentar tráfego hoje?',
    pricing:
      'Precisa de ajuda para escolher o plano ideal?',
    reviews:
      'Quer mais avaliações ou ajuda para responder clientes?',
    video:
      'Precisa de ideias para roteiro, gancho, legendas ou voz?',
    website:
      'Descreva seu negócio e posso ajudar a criar um site.',
    growth:
      'Quer aumentar tráfego, leads ou visibilidade?',
    thinking: 'Pensando...',
  },

  es: {
    label: 'Conserje IA',
    title: 'Conserje IA',
    default:
      'Hola, soy tu conserje de SignalBoost. Puedo ayudarte con videos, créditos, reseñas y soporte.',
    dashboard:
      'Bienvenido otra vez. ¿Quieres crear contenido o aumentar tráfico?',
    pricing:
      '¿Necesitas ayuda para elegir el mejor plan?',
    reviews:
      '¿Quieres más reseñas o ayuda para responder clientes?',
    video:
      '¿Necesitas ideas para guiones, ganchos o voz?',
    website:
      'Describe tu negocio y puedo ayudarte a crear un sitio.',
    growth:
      '¿Quieres aumentar tráfico, clientes o visibilidad?',
    thinking: 'Pensando...',
  },

  pl: {
    label: 'Konsjerż AI',
    title: 'Konsjerż AI',
    default:
      'Cześć, jestem konsjerżem SignalBoost.',
    dashboard:
      'Witamy ponownie. Chcesz tworzyć treści lub zwiększyć ruch?',
    pricing:
      'Potrzebujesz pomocy w wyborze planu?',
    reviews:
      'Chcesz więcej opinii lub pomocy z odpowiedziami?',
    video:
      'Potrzebujesz pomysłów na scenariusz lub napisy?',
    website:
      'Opisz swój biznes, a pomogę stworzyć stronę.',
    growth:
      'Chcesz zwiększyć ruch lub widoczność?',
    thinking: 'Myślę...',
  },

  ru: {
    label: 'AI-консьерж',
    title: 'AI-консьерж',
    default:
      'Здравствуйте, я консьерж SignalBoost.',
    dashboard:
      'С возвращением. Хотите создать контент или увеличить трафик?',
    pricing:
      'Нужна помощь с выбором тарифа?',
    reviews:
      'Хотите больше отзывов или помощь с ответами?',
    video:
      'Нужны идеи для сценариев, заголовков или озвучки?',
    website:
      'Опишите ваш бизнес, и я помогу создать сайт.',
    growth:
      'Хотите увеличить трафик или видимость?',
    thinking: 'Думаю...',
  },
}

export default function Concierge() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const pathname = usePathname()
  const { lang } = useI18n()

  const copy =
    COPY[lang as keyof typeof COPY] || COPY.en

  function getPageGreeting() {
    const path =
      pathname?.toLowerCase() || ''

    if (path.includes('dashboard'))
      return copy.dashboard

    if (path.includes('pricing'))
      return copy.pricing

    if (
      path.includes('video') ||
      path.includes('studio')
    )
      return copy.video

    if (path.includes('review'))
      return copy.reviews

    if (
      path.includes('website') ||
      path.includes('builder')
    )
      return copy.website

    if (path.includes('growth'))
      return copy.growth

    return copy.default
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
            maxWidth:'calc(100vw - 40px)',
            borderRadius:24,
            background:
              'rgba(15,15,20,.96)',
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
            <strong>
              {copy.title}
            </strong>

            <button
              onClick={() =>
                setOpen(false)
              }
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
            }}
          >
            {loading
              ? copy.thinking
              : message ||
                getPageGreeting()}
          </div>
        </div>
      )}
    </>
  )
}
