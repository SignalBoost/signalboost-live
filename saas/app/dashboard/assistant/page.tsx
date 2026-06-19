'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import AssistantMessage from '@/components/AssistantMessage'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Msg = { role: 'user' | 'assistant'; content: string }
type ConvSummary = { id: string; title: string; summary: string; message_count: number; updated_at: string }
type VideoItem = { title: string; type: string; id: string }

const COPY = {
  eyebrow: { en: 'Assistant', es: 'Asistente', pt: 'Assistente', pl: 'Asystent', ru: 'Ассистент' },
  title: { en: 'Your SignalBoost concierge', es: 'Tu concierge de SignalBoost', pt: 'Seu concierge SignalBoost', pl: 'Twój concierge SignalBoost', ru: 'Ваш консьерж SignalBoost' },
  subtitle: { en: 'Ask anything about building, promoting, reviews, audio, video, or your account.', es: 'Pregunta sobre construcción, promoción, reseñas, audio, video o tu cuenta.', pt: 'Pergunte sobre construção, promoção, avaliações, áudio, vídeo ou sua conta.', pl: 'Pytaj o budowanie, promocję, opinie, audio, wideo lub swoje konto.', ru: 'Спрашивайте о создании, продвижении, отзывах, аудио, видео или вашем аккаунте.' },
  empty: { en: 'Ask me anything, or start with one of these:', es: 'Pregúntame lo que quieras, o empieza con una de estas:', pt: 'Pergunte-me qualquer coisa, ou comece com uma destas:', pl: 'Zapytaj mnie o cokolwiek lub zacznij od jednego z tych:', ru: 'Спросите меня что угодно или начните с одного из вариантов:' },
  thinking: { en: 'Thinking…', es: 'Pensando…', pt: 'Pensando…', pl: 'Myślę…', ru: 'Думаю…' },
  placeholder: { en: 'Ask the concierge…', es: 'Pregunta al concierge…', pt: 'Pergunte ao concierge…', pl: 'Zapytaj concierge…', ru: 'Спросите консьержа…' },
  send: { en: 'Send', es: 'Enviar', pt: 'Enviar', pl: 'Wyślij', ru: 'Отправить' },
  error: { en: 'Sorry, I could not answer that right now.', es: 'Lo siento, no pude responder eso ahora mismo.', pt: 'Desculpe, não pude responder isso agora.', pl: 'Przepraszam, nie mogłem teraz odpowiedzieć.', ru: 'Извините, не могу ответить прямо сейчас.' },
  history: { en: 'History', es: 'Historial', pt: 'Histórico', pl: 'Historia', ru: 'История' },
  newChat: { en: 'New chat', es: 'Nuevo chat', pt: 'Novo chat', pl: 'Nowy czat', ru: 'Новый чат' },
  noHistory: { en: 'No conversations yet.', es: 'Aún no hay conversaciones.', pt: 'Ainda não há conversas.', pl: 'Brak rozmów.', ru: 'Пока нет разговоров.' },
  loadingHistory: { en: 'Loading…', es: 'Cargando…', pt: 'Carregando…', pl: 'Ładowanie…', ru: 'Загрузка…' },
  historyError: { en: 'Could not load history.', es: 'No se pudo cargar el historial.', pt: 'Não foi possível carregar o histórico.', pl: 'Nie udało się załadować historii.', ru: 'Не удалось загрузить историю.' },
  deleteConfirm: { en: 'Delete this conversation?', es: '¿Eliminar esta conversación?', pt: 'Excluir esta conversa?', pl: 'Usunąć tę rozmowę?', ru: 'Удалить этот разговор?' },
  untitled: { en: 'Untitled conversation', es: 'Conversación sin título', pt: 'Conversa sem título', pl: 'Rozmowa bez tytułu', ru: 'Разговор без названия' },
  close: { en: 'Close', es: 'Cerrar', pt: 'Fechar', pl: 'Zamknij', ru: 'Закрыть' },
  suggestions: {
    s1: { en: 'How do I publish my first website?', es: '¿Cómo publico mi primer sitio web?', pt: 'Como publico meu primeiro site?', pl: 'Jak opublikować moją pierwszą stronę?', ru: 'Как опубликовать первый сайт?' },
    s2: { en: 'Help me plan an outreach campaign', es: 'Ayúdame a planificar una campaña de prospección', pt: 'Me ajude a planejar uma campanha de prospecção', pl: 'Pomóż mi zaplanować kampanię outreach', ru: 'Помоги спланировать кампанию аутрич' },
    s3: { en: 'What does my plan include?', es: '¿Qué incluye mi plan?', pt: 'O que inclui meu plano?', pl: 'Co zawiera mój plan?', ru: 'Что включает мой план?' },
    s4: { en: 'How do I collect customer reviews?', es: '¿Cómo recopilo reseñas de clientes?', pt: 'Como coleo avaliações de clientes?', pl: 'Jak zbierać opinie klientów?', ru: 'Как собирать отзывы клиентов?' },
  },
}

const DATE_LOCALES: Record<Lang, string> = { en: 'en-US', es: 'es-MX', pt: 'pt-BR', pl: 'pl-PL', ru: 'ru-RU' }

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

function extractVideoJson(content: string): { before: string; videos: VideoItem[]; after: string } | null {
  const startMatch = content.match(/\[\s*\{/)
  if (!startMatch || startMatch.index === undefined) return null

  const start = startMatch.index
  const end = content.lastIndexOf(']')
  if (end <= start) return null

  const before = content.slice(0, start).trim()
  const raw = content.slice(start, end + 1)
  const after = content.slice(end + 1).trim()

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    const videos = parsed
      .map((v: any) => ({
        title: typeof v?.title === 'string' ? v.title : 'Video',
        type: typeof v?.type === 'string' ? v.type : 'video',
        id: typeof v?.id === 'string' ? v.id : '',
      }))
      .filter((v: VideoItem) => /^(video|youtube)$/i.test(v.type) && /^[A-Za-z0-9_-]{11}$/.test(v.id))

    return videos.length ? { before, videos, after } : null
  } catch {
    return null
  }
}

function VideoJsonMessage({ content }: { content: string }) {
  const block = extractVideoJson(content)

  if (!block) return <AssistantMessage content={content} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {block.before ? <AssistantMessage content={block.before} /> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {block.videos.map((video, i) => (
          <div key={`${video.id}-${i}`} style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 14, overflow: 'hidden', background: 'rgba(3,7,18,.75)' }}>
            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000' }}>
              <iframe
                src={`https://www.youtube.com/embed/${encodeURIComponent(video.id)}`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              />
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>{video.title}</div>
              <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, color: '#1af0ff', fontSize: 11.5, textDecoration: 'underline' }}>
                Open on YouTube ↗
              </a>
            </div>
          </div>
        ))}
      </div>

      {block.after ? <AssistantMessage content={block.after} /> : null}
    </div>
  )
}

export default function AssistantPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef<string>('')

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [conversations, setConversations] = useState<ConvSummary[]>([])

  const suggestions = [
    c(COPY.suggestions.s1, l),
    c(COPY.suggestions.s2, l),
    c(COPY.suggestions.s3, l),
    c(COPY.suggestions.s4, l),
  ]

  useEffect(() => {
    if (messages.length === 0) return
    const el = threadRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const content = text.trim()
    if (!content || loading) return
    if (!conversationIdRef.current) conversationIdRef.current = crypto.randomUUID()

    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context: { language: lang, currentPage: '/dashboard/assistant', conversationId: conversationIdRef.current } }),
      })

      const data = await res.json()
      setMessages([...next, { role: 'assistant', content: data?.reply || data?.error || c(COPY.error, l) }])
    } catch {
      setMessages([...next, { role: 'assistant', content: c(COPY.error, l) }])
    } finally {
      setLoading(false)
    }
  }

  async function openHistory() {
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryError(false)
    try {
      const res = await fetch('/api/assistant/chats')
      if (!res.ok) throw new Error('history load failed')
      const data = await res.json()
      setConversations(Array.isArray(data?.conversations) ? data.conversations : [])
    } catch {
      setHistoryError(true)
      setConversations([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadConversation(id: string) {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/assistant/chats?id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error('transcript load failed')
      const data = await res.json()
      const loaded: Msg[] = (Array.isArray(data?.messages) ? data.messages : [])
        .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
        .map((m: any) => ({ role: m.role, content: m.content }))

      conversationIdRef.current = id
      setMessages(loaded)
      setHistoryOpen(false)
    } catch {
      setHistoryError(true)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm(c(COPY.deleteConfirm, l))) return
    try {
      await fetch(`/api/assistant/chats?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      setConversations(prev => prev.filter(conv => conv.id !== id))
      if (conversationIdRef.current === id) {
        conversationIdRef.current = ''
        setMessages([])
      }
    } catch {
      setHistoryError(true)
    }
  }

  function startNewChat() {
    conversationIdRef.current = ''
    setMessages([])
    setHistoryOpen(false)
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(DATE_LOCALES[l], { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 165px)', minHeight: 480, maxWidth: 1280, margin: '0 auto', padding: '24px 28px', width: '100%', boxSizing: 'border-box', color: 'var(--text-primary)' }}>
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.16), transparent 22rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 24, padding: '20px 24px', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p className="sb-eyebrow">✨ {c(COPY.eyebrow, l)}</p>
            <h1 style={{ fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '6px 0 6px' }}>{c(COPY.title, l)}</h1>
            <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{c(COPY.subtitle, l)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => (historyOpen ? setHistoryOpen(false) : openHistory())} className="sb-button-secondary" style={{ fontSize: 12, padding: '9px 14px', whiteSpace: 'nowrap' }}>🕘 {c(COPY.history, l)}</button>
            <button onClick={startNewChat} className="sb-button-secondary" style={{ fontSize: 12, padding: '9px 14px', whiteSpace: 'nowrap' }}>＋ {c(COPY.newChat, l)}</button>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.1)', borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <div style={{ maxWidth: msg.role === 'user' ? '80%' : '100%', width: msg.role === 'assistant' ? '100%' : 'auto', padding: '12px 16px', borderRadius: 16, borderTopRightRadius: msg.role === 'user' ? 4 : 16, borderTopLeftRadius: msg.role === 'user' ? 16 : 4, background: msg.role === 'user' ? 'rgba(255,195,0,.12)' : 'rgba(26,240,255,.07)', border: `1px solid ${msg.role === 'user' ? 'rgba(255,195,0,.28)' : 'rgba(26,240,255,.2)'}`, color: '#fff', fontSize: 14, lineHeight: 1.7, whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal' }}>
                {msg.role === 'assistant' ? <VideoJsonMessage content={msg.content} /> : msg.content}
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
        </div>

        {historyOpen && (
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(320px, 88%)', zIndex: 5, background: 'linear-gradient(160deg, rgba(10,16,32,.97), rgba(3,7,18,.97))', border: '1px solid rgba(26,240,255,.25)', borderRadius: 22, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 18px 50px rgba(0,0,0,.55)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.02em', color: 'rgba(26,240,255,.9)' }}>🕘 {c(COPY.history, l)}</span>
              <button onClick={() => setHistoryOpen(false)} className="sb-button-secondary" style={{ fontSize: 11, padding: '6px 10px' }}>{c(COPY.close, l)}</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {historyLoading && <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>{c(COPY.loadingHistory, l)}</p>}
              {!historyLoading && historyError && <p style={{ color: 'rgba(255,140,140,.8)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>{c(COPY.historyError, l)}</p>}
              {!historyLoading && !historyError && conversations.length === 0 && <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>{c(COPY.noHistory, l)}</p>}

              {!historyLoading && conversations.map(conv => (
                <div key={conv.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6, background: conversationIdRef.current === conv.id ? 'rgba(26,240,255,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${conversationIdRef.current === conv.id ? 'rgba(26,240,255,.35)' : 'rgba(255,255,255,.1)'}`, borderRadius: 14, padding: '10px 12px' }}>
                  <button onClick={() => loadConversation(conv.id)} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: '#fff' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.title || c(COPY.untitled, l)}</div>
                    {conv.summary ? <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conv.summary}</div> : null}
                    <div style={{ fontSize: 10, color: 'rgba(26,240,255,.6)', marginTop: 4 }}>{formatDate(conv.updated_at)} · {conv.message_count}</div>
                  </button>
                  <button onClick={() => deleteConversation(conv.id)} title={c(COPY.deleteConfirm, l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,140,140,.7)', fontSize: 14, padding: '0 2px', flexShrink: 0 }}>🗑</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
