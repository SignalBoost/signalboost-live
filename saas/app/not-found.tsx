'use client'

import { useEffect, useState } from 'react'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, { heading: string; body: string; cta: string }> = {
  en: { heading: '404', body: 'Page not found', cta: '← Back to dashboard' },
  es: { heading: '404', body: 'Página no encontrada', cta: '← Volver al panel' },
  pt: { heading: '404', body: 'Página não encontrada', cta: '← Voltar ao painel' },
  pl: { heading: '404', body: 'Strona nie znaleziona', cta: '← Wróć do panelu' },
  ru: { heading: '404', body: 'Страница не найдена', cta: '← Назад к панели' },
}

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const code = (navigator.language || 'en').slice(0, 2).toLowerCase()
  const map: Record<string, Lang> = { en: 'en', es: 'es', pt: 'pt', pl: 'pl', ru: 'ru' }
  return map[code] ?? 'en'
}

export default function NotFound() {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    setLang(detectLang())
  }, [])

  const c = COPY[lang]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      background: 'linear-gradient(160deg, rgba(15,23,42,1), rgba(3,7,18,1))',
    }}>
      <div style={{ fontSize: 64, fontWeight: 900, color: '#ffc300', lineHeight: 1 }}>{c.heading}</div>
      <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 16, margin: 0 }}>{c.body}</p>
      <a href="/dashboard" style={{ color: '#1af0ff', fontWeight: 800, textDecoration: 'none', fontSize: 14 }}>
        {c.cta}
      </a>
    </div>
  )
}
