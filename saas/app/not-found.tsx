'use client'

import { useEffect, useState } from 'react'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY: Record<Lang, { heading: string; body: string; cta: string }> = {
  en: { heading: '404', body: uiText('generatedUi.u_a469ab4ca4e55bf5'), cta: uiText('generatedUi.u_252bc062c95743ff') },
  es: { heading: '404', body: 'Página no encontrada', cta: '← Volver al panel' },
  pt: { heading: '404', body: 'Página não encontrada', cta: '← Voltar ao painel' },
  pl: { heading: '404', body: 'Strona nie znaleziona', cta: '← Wróć do panelu' },
  ru: { heading: '404', body: 'Страница не найдена', cta: '← Назад к панели' },
  de: { heading: '404', body: 'Seite nicht gefunden', cta: '← Zurück zum Dashboard' },
  fr: { heading: '404', body: 'Page introuvable', cta: '← Retour au tableau de bord' },
  it: { heading: '404', body: 'Pagina non trovata', cta: '← Torna alla dashboard' },
  ja: { heading: '404', body: 'ページが見つかりません', cta: '← ダッシュボードに戻る' },
  ko: { heading: '404', body: '페이지를 찾을 수 없습니다', cta: '← 대시보드로 돌아가기' },
  ar: { heading: '404', body: 'الصفحة غير موجودة', cta: '→ العودة إلى لوحة التحكم' },
}

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const code = (navigator.language || 'en').slice(0, 2).toLowerCase()
  const map: Record<string, Lang> = { en: 'en', es: 'es', pt: 'pt', pl: 'pl', ru: 'ru', de: 'de', fr: 'fr', it: 'it', ja: 'ja', ko: 'ko', ar: 'ar' }
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
