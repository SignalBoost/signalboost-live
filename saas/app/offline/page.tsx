'use client'

import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, { heading: string; body: string; cta: string }> = {
  en: { heading: 'No signal', body: 'You appear to be offline. Check your connection and try again.', cta: 'Try again' },
  es: { heading: 'Sin señal', body: 'Parece que estás sin conexión. Verifica tu conexión e inténtalo de nuevo.', cta: 'Intentar de nuevo' },
  pt: { heading: 'Sem sinal', body: 'Parece que você está offline. Verifique sua conexão e tente novamente.', cta: 'Tentar novamente' },
  pl: { heading: 'Brak sygnału', body: 'Wygląda na to, że jesteś offline. Sprawdź połączenie i spróbuj ponownie.', cta: 'Spróbuj ponownie' },
  ru: { heading: 'Нет сигнала', body: 'Похоже, вы не в сети. Проверьте соединение и попробуйте снова.', cta: 'Попробовать снова' },
}

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const code = (navigator.language || 'en').slice(0, 2).toLowerCase()
  const map: Record<string, Lang> = { en: 'en', es: 'es', pt: 'pt', pl: 'pl', ru: 'ru' }
  return map[code] ?? 'en'
}

export default function OfflinePage() {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    setLang(detectLang())
  }, [])

  const c = COPY[lang]

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>
      <Navbar />
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 80px)',
        textAlign: 'center',
        padding: '32px',
      }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>📡</div>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>{c.heading}</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, maxWidth: 320, lineHeight: 1.6 }}>
          {c.body}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 32,
            background: '#ffc300',
            color: '#000',
            fontWeight: 800,
            fontSize: 14,
            padding: '12px 32px',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
          }}>
          {c.cta}
        </button>
      </div>
    </main>
  )
}
