'use client'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const MAP: Record<string, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  pl: 'Polski',
  ru: 'Русский',
}

// This popup intentionally speaks the SUGGESTED language, not the active one.
// A visitor whose browser is Polish but who sees the English default needs the
// offer phrased in Polish to understand it. So we use a local table keyed by the
// suggested language code rather than pulling from the active dictionary.
const STRINGS: Record<string, { title: string; body: string; switch: string; keep: string }> = {
  en: {
    title: '🌎 Language suggestion',
    body: 'We noticed you may prefer',
    switch: 'Switch',
    keep: 'Keep current',
  },
  es: {
    title: '🌎 Sugerencia de idioma',
    body: 'Notamos que quizás prefieras',
    switch: 'Cambiar',
    keep: 'Mantener actual',
  },
  pt: {
    title: '🌎 Sugestão de idioma',
    body: 'Notamos que você pode preferir',
    switch: 'Mudar',
    keep: 'Manter atual',
  },
  pl: {
    title: '🌎 Sugestia języka',
    body: 'Zauważyliśmy, że możesz preferować',
    switch: 'Zmień',
    keep: 'Zostaw obecny',
  },
  ru: {
    title: '🌎 Предложение языка',
    body: 'Мы заметили, что вы можете предпочесть',
    switch: 'Переключить',
    keep: 'Оставить текущий',
  },
}

export default function LanguageSuggestion() {
  const { lang, setLang } = useI18n()
  const [show, setShow] = useState(false)
  const [suggested, setSuggested] = useState('en')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const alreadyHandled = localStorage.getItem('signalboost_language_prompted')
    if (alreadyHandled) return

    const browser = (
      navigator.languages?.[0] ||
      navigator.language ||
      'en'
    ).toLowerCase()

    let detected = 'en'
    if (browser.startsWith('es')) detected = 'es'
    if (browser.startsWith('pt')) detected = 'pt'
    if (browser.startsWith('pl')) detected = 'pl'
    if (browser.startsWith('ru')) detected = 'ru'

    if (detected !== lang) {
      setSuggested(detected)
      setShow(true)
    }
  }, [lang])

  function keepCurrent() {
    localStorage.setItem('signalboost_language_prompted', '1')
    setShow(false)
  }

  async function switchLanguage() {
    await setLang(suggested)
    localStorage.setItem('signalboost_language_prompted', '1')
    setShow(false)
  }

  if (!show) return null

  const s = STRINGS[suggested] || STRINGS.en

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 320,
        zIndex: 999,
        background: 'var(--surface-1)',
        border: '1px solid var(--border-medium)',
        borderRadius: 18,
        padding: 18,
        boxShadow: '0 15px 50px rgba(0,0,0,.35)',
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 8 }}>
        {s.title}
      </div>

      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          lineHeight: 1.6,
          marginBottom: 18,
        }}
      >
        {s.body}{' '}
        <strong>{MAP[suggested]}</strong>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={switchLanguage}
          style={{
            flex: 1,
            background: '#ffc300',
            color: '#000',
            border: 'none',
            borderRadius: 999,
            padding: '10px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {s.switch}
        </button>
        <button
          onClick={keepCurrent}
          style={{
            flex: 1,
            background: 'var(--surface-2)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 999,
            padding: '10px',
            cursor: 'pointer',
          }}
        >
          {s.keep}
        </button>
      </div>
    </div>
  )
}
