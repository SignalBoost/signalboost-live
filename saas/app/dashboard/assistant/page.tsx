'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY = {
  eyebrow:     { en: 'Assistant', es: 'Asistente', pt: 'Assistente', pl: 'Asystent', ru: 'Ассистент' },
  title:       { en: 'Your SignalBoost concierge', es: 'Tu concierge de SignalBoost', pt: 'Seu concierge SignalBoost', pl: 'Twój concierge SignalBoost', ru: 'Ваш консьерж SignalBoost' },
  subtitle:    { en: 'Ask anything about building, promoting, reviews, audio, video, or your account.', es: 'Pregunta sobre construcción, promoción, reseñas, audio, video o tu cuenta.', pt: 'Pergunte sobre construção, promoção, avaliações, áudio, vídeo ou sua conta.', pl: 'Pytaj o budowanie, promocję, opinie, audio, wideo lub swoje konto.', ru: 'Спрашивайте о создании, продвижении, отзывах, аудио, видео или вашем аккаунте.' },
  empty:       { en: 'Ask me anything, or start with one of these:', es: 'Pregúntame lo que quieras, o empieza con una de estas:', pt: 'Pergunte-me qualquer coisa, ou comece com uma destas:', pl: 'Zapytaj mnie o cokolwiek lub zacznij od jednego z tych:', ru: 'Спросите меня что угодно или начните с одного из вариантов:' },
  thinking:    { en: 'Thinking…', es: 'Pensando…', pt: 'Pensando…', pl: 'Myślę…', ru: 'Думаю…' },
  placeholder: { en: 'Ask the concierge…', es: 'Pregunta al concierge…', pt: 'Pergunte ao concierge…', pl: 'Zapytaj concierge…', ru: 'Спросите консьержа…' },
  send:        { en: 'Send', es: 'Enviar', pt: 'Enviar', pl: 'Wyślij', ru: 'Отправить' },
  error:       { en: 'Sorry, I could not answer that right now.', es: 'Lo siento, no pude responder eso ahora mismo.', pt: 'Desculpe, não pude responder isso agora.', pl: 'Przepraszam, nie mogłem teraz odpowiedzieć.', ru: 'Извините, не могу ответить прямо сейчас.' },
  suggestions: {
    s1: { en: 'How do I publish my first website?', es: '¿Cómo publico mi primer sitio web?', pt: 'Como publico meu primeiro site?', pl: 'Jak opublikować moją pierwszą stronę?', ru: 'Как опубликовать первый сайт?' },
    s2: { en: 'Help me plan an outreach campaign', es: 'Ayúdame a planificar una campaña de prospección', pt: 'Me ajude a planejar uma campanha de prospecção', pl: 'Pomóż mi zaplanować kampanię outreach', ru: 'Помоги спланировать кампанию аутрич' },
    s3: { en: 'What does my plan include?', es: '¿Qué incluye mi plan?', pt: 'O que inclui meu plano?', pl: 'Co zawiera mój plan?', ru: 'Что включает мой план?' },
    s4: { en: 'How do I collect customer reviews?', es: '¿Cómo recopilo reseñas de clientes?', pt: 'Como coleo avaliações de clientes?', pl: 'Jak zbierać opinie klientów?', ru: 'Как собирать отзывы клиентов?' },
  },
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

type Msg = { role: 'user' | 'assistant'; content: string }

export default function AssistantPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)

  const suggestions = [
    c(COPY.suggestions.s1, l),
    c(COPY.suggestions.s2, l),
    c(COPY.suggestions.s3, l),
    c(COPY.suggestions.s4, l),
  ]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const content = text.trim()
    if (!content || loading) return
    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next); setInput(''); setLoading(true)
    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context: { language: lang, currentPage: '/dashboard/assistant' } }),
      })
      const data = await res.json()
      setMessages([...next, { role: 'assistant', content: data?.reply || data?.error || c(COPY.error, l) }])
    } catch {
      setMessages([...next, { role: 'assistant', content: c(COPY.error, l) }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 65px)', maxWidth: 900, margin: '0 auto', padding: '24px 0', width: '100%', boxSizing: 'border-box', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.16), transparent 22rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 24, padding: '20px 24px', marginBottom: 16, flexShrink: 0 }}>
        <p className="sb-eyebrow">✨ {c(COPY.eyebrow, l)}</p>
        <h1 style={{ fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '6px 0 6px' }}>{c(COPY.title, l)}</h1>
        <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{c(COPY.subtitle, l)}</p>
      </div>

      {/* Message thread */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {messages.length === 0 && !loading && (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 520 }}>
            <div style={{ fontSize: 40 }}>✨</div>
            <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>{c(COPY.empty, l)}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => send(s)} className="sb-button-secondary" style={{ fontSize: 12, padding: '9px 14px' }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={`${msg.role}-${i}`} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%', padding: '12px 16px', borderRadius: 16, borderTopRightRadius: msg.role === 'user' ? 4 : 16, borderTopLeftRadius: msg.role === 'user' ? 16 : 4, background: msg.role === 'user' ? 'rgba(255,195,0,.12)' : 'rgba(26,240,255,.07)', border: `1px solid ${msg.role === 'user' ? 'rgba(255,195,0,.28)' : 'rgba(26,240,255,.2)'}`, color: '#fff', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '12px 16px', borderRadius: 16, borderTopLeftRadius: 4, background: 'rgba(26,240,255,.07)', border: '1px solid rgba(26,240,255,.2)', color: 'rgba(255,255,255,.5)', fontSize: 14 }}>
              {c(COPY.thinking, l)}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexShrink: 0 }}>
        <input
          className="sb-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(input) }}
          placeholder={c(COPY.placeholder, l)}
          style={{ flex: 1, padding: '13px 16px', borderRadius: 14, fontSize: 14 }}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="sb-button-primary"
          style={{ padding: '0 24px', borderRadius: 14, opacity: loading || !input.trim() ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
        >
          {c(COPY.send, l)}
        </button>
      </div>
    </div>
  )
}
