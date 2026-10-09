'use client'

import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY: Record<Lang, { heading: string; body: string; cta: string }> = {
  en: { heading: uiText('generatedUi.u_5ea2abdbce904d1c'), body: uiText('generatedUi.u_0d700f8ef11158ea'), cta: uiText('generatedUi.u_d8b8392e2c542950') },
  es: { heading: 'Sin señal', body: 'Parece que estás sin conexión. Verifica tu conexión e inténtalo de nuevo.', cta: 'Intentar de nuevo' },
  pt: { heading: 'Sem sinal', body: 'Parece que você está offline. Verifique sua conexão e tente novamente.', cta: 'Tentar novamente' },
  pl: { heading: 'Brak sygnału', body: 'Wygląda na to, że jesteś offline. Sprawdź połączenie i spróbuj ponownie.', cta: 'Spróbuj ponownie' },
  ru: { heading: 'Нет сигнала', body: 'Похоже, вы не в сети. Проверьте соединение и попробуйте снова.', cta: 'Попробовать снова' },
  de: { heading: 'Kein Signal', body: 'Sie scheinen offline zu sein. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.', cta: 'Erneut versuchen' },
  fr: { heading: 'Aucun signal', body: 'Vous semblez être hors ligne. Vérifiez votre connexion et réessayez.', cta: 'Réessayer' },
  it: { heading: 'Nessun segnale', body: 'Sembra che tu sia offline. Controlla la connessione e riprova.', cta: 'Riprova' },
  ja: { heading: 'シグナルなし', body: 'オフラインのようです。接続を確認してもう一度お試しください。', cta: '再試行' },
  ko: { heading: '신호 없음', body: '오프라인 상태인 것 같습니다. 연결을 확인하고 다시 시도하세요.', cta: '다시 시도' },
  ar: { heading: 'لا توجد إشارة', body: 'يبدو أنك غير متصل. تحقق من اتصالك وحاول مرة أخرى.', cta: 'إعادة المحاولة' },
}

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en'
  const code = (navigator.language || 'en').slice(0, 2).toLowerCase()
  const map: Record<string, Lang> = { en: 'en', es: 'es', pt: 'pt', pl: 'pl', ru: 'ru', de: 'de', fr: 'fr', it: 'it', ja: 'ja', ko: 'ko', ar: 'ar' }
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
