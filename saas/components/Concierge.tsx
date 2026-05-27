'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'pt' | 'es' | 'pl' | 'ru'
type Message = { role: 'user' | 'assistant'; content: string }

type Copy = {
  title: string
  button: string
  greeting: string
  placeholder: string
  send: string
  reset: string
  thinking: string
  fallback: string
  connectionError: string
  close: string
  quick: { label: string; prompt: string }[]
}

const COPY: Record<Lang, Copy> = {
  en: {
    title: 'AI Concierge',
    button: 'Concierge',
    greeting: "Hi, I'm your SignalBoost concierge. Ask me anything about your workspace.",
    placeholder: 'Ask anything...',
    send: 'Send',
    reset: 'Reset',
    thinking: 'Thinking...',
    fallback: 'I could not generate a response.',
    connectionError: 'Connection problem. Please try again.',
    close: 'Close concierge',
    quick: [
      { label: '🎥 Videos', prompt: 'How do I create videos in SignalBoost?' },
      { label: '⚡ Credits', prompt: 'Explain how credits work in SignalBoost.' },
      { label: '📈 Growth', prompt: 'Give me growth ideas using SignalBoost.' },
      { label: '💬 Support', prompt: 'I need help using SignalBoost.' },
    ],
  },
  pt: {
    title: 'Concierge IA',
    button: 'Concierge',
    greeting: 'Olá, eu sou o concierge da SignalBoost. Pergunte qualquer coisa sobre seu espaço de trabalho.',
    placeholder: 'Pergunte qualquer coisa...',
    send: 'Enviar',
    reset: 'Reiniciar',
    thinking: 'Pensando...',
    fallback: 'Não consegui gerar uma resposta.',
    connectionError: 'Problema de conexão. Tente novamente.',
    close: 'Fechar concierge',
    quick: [
      { label: '🎥 Vídeos', prompt: 'Como eu crio vídeos na SignalBoost?' },
      { label: '⚡ Créditos', prompt: 'Explique como funcionam os créditos na SignalBoost.' },
      { label: '📈 Crescimento', prompt: 'Me dê ideias de crescimento usando a SignalBoost.' },
      { label: '💬 Suporte', prompt: 'Preciso de ajuda para usar a SignalBoost.' },
    ],
  },
  es: {
    title: 'Concierge IA',
    button: 'Concierge',
    greeting: 'Hola, soy tu concierge de SignalBoost. Pregúntame cualquier cosa sobre tu espacio de trabajo.',
    placeholder: 'Pregunta cualquier cosa...',
    send: 'Enviar',
    reset: 'Reiniciar',
    thinking: 'Pensando...',
    fallback: 'No pude generar una respuesta.',
    connectionError: 'Problema de conexión. Inténtalo de nuevo.',
    close: 'Cerrar concierge',
    quick: [
      { label: '🎥 Videos', prompt: '¿Cómo creo videos en SignalBoost?' },
      { label: '⚡ Créditos', prompt: 'Explica cómo funcionan los créditos en SignalBoost.' },
      { label: '📈 Crecimiento', prompt: 'Dame ideas de crecimiento usando SignalBoost.' },
      { label: '💬 Soporte', prompt: 'Necesito ayuda para usar SignalBoost.' },
    ],
  },
  pl: {
    title: 'Konsjerż AI',
    button: 'Konsjerż',
    greeting: 'Cześć, jestem konsjerżem SignalBoost. Zapytaj mnie o wszystko w swoim obszarze roboczym.',
    placeholder: 'Zapytaj o cokolwiek...',
    send: 'Wyślij',
    reset: 'Resetuj',
    thinking: 'Myślę...',
    fallback: 'Nie udało się wygenerować odpowiedzi.',
    connectionError: 'Problem z połączeniem. Spróbuj ponownie.',
    close: 'Zamknij konsjerża',
    quick: [
      { label: '🎥 Wideo', prompt: 'Jak tworzyć wideo w SignalBoost?' },
      { label: '⚡ Kredyty', prompt: 'Wyjaśnij, jak działają kredyty w SignalBoost.' },
      { label: '📈 Wzrost', prompt: 'Podaj pomysły na wzrost z użyciem SignalBoost.' },
      { label: '💬 Pomoc', prompt: 'Potrzebuję pomocy w korzystaniu z SignalBoost.' },
    ],
  },
  ru: {
    title: 'AI-консьерж',
    button: 'Консьерж',
    greeting: 'Здравствуйте, я консьерж SignalBoost. Спросите меня о вашем рабочем пространстве.',
    placeholder: 'Спросите что угодно...',
    send: 'Отправить',
    reset: 'Сбросить',
    thinking: 'Думаю...',
    fallback: 'Не удалось создать ответ.',
    connectionError: 'Проблема с подключением. Попробуйте снова.',
    close: 'Закрыть консьерж',
    quick: [
      { label: '🎥 Видео', prompt: 'Как создавать видео в SignalBoost?' },
      { label: '⚡ Кредиты', prompt: 'Объясните, как работают кредиты в SignalBoost.' },
      { label: '📈 Рост', prompt: 'Дайте идеи роста с помощью SignalBoost.' },
      { label: '💬 Поддержка', prompt: 'Мне нужна помощь с SignalBoost.' },
    ],
  },
}

export default function Concierge() {
  const pathname = usePathname()
  const { lang } = useI18n()
  const activeLang = (['en', 'pt', 'es', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
  const copy = COPY[activeLang]

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const visibleMessages = messages.length
    ? messages
    : [{ role: 'assistant' as const, content: copy.greeting }]

  function resetVisibleChat() {
    setInput('')
    setLoading(false)
    setMessages([])
  }

  async function ask(text: string) {
    const content = text.trim()
    if (!content || loading) return

    const nextMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          context: {
            currentPage: pathname,
            language: activeLang,
          },
        }),
      })

      const data = await res.json()
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.reply || data.error || copy.fallback },
      ])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: copy.connectionError }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(value => !value)} style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 999999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 999, background: 'linear-gradient(135deg,#ffc300,#ff9500)', color: '#111', fontWeight: 900, boxShadow: '0 20px 50px rgba(255,149,0,.35)' }}>
        <span style={{ fontSize: 24 }}>✨</span>
        {copy.button}
      </button>

      {open && (
        <div className="hero-panel" style={{ position: 'fixed', right: 24, bottom: 100, zIndex: 999999, width: 420, maxWidth: 'calc(100vw - 30px)', padding: 20, color: 'white', borderRadius: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>SignalBoost</div>
              <strong style={{ fontSize: 18 }}>{copy.title}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={resetVisibleChat} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border-soft)', color: 'white', borderRadius: 999, padding: '7px 10px', fontSize: 12 }}>
                {copy.reset}
              </button>
              <button onClick={() => setOpen(false)} aria-label={copy.close} style={{ background: 'transparent', border: '1px solid var(--border-soft)', color: 'white', width: 34, height: 34, borderRadius: 999, fontSize: 20 }}>
                ×
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {visibleMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '10px 12px', borderRadius: 14, background: message.role === 'user' ? 'rgba(59,130,246,.18)' : 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', lineHeight: 1.55, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {message.content}
              </div>
            ))}
            {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{copy.thinking}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {copy.quick.map(item => (
              <button key={item.label} type="button" onClick={() => ask(item.prompt)} className="sb-button-ghost" style={{ padding: '9px 10px', fontSize: 12 }}>
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') ask(input) }} className="sb-input" style={{ flex: 1, padding: 12, minWidth: 0 }} placeholder={copy.placeholder} />
            <button type="button" className="sb-button-primary" onClick={() => ask(input)} disabled={loading || !input.trim()}>
              {copy.send}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
