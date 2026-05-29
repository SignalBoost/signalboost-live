'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import ResetButton from '@/components/ResetButton'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type Message = { role: 'user' | 'assistant'; content: string }

const QUICK_KEYS = [
  { label: 'concierge.quick.marketplace.label', prompt: 'concierge.quick.marketplace.prompt', fallbackLabel: '🛰️ Marketplace', fallbackPrompt: 'Guide me through marketplace partners, categories, and bookings.' },
  { label: 'concierge.quick.saas.label', prompt: 'concierge.quick.saas.prompt', fallbackLabel: '🚀 SaaS cockpit', fallbackPrompt: 'Guide me through Promote Business, Reviews, Calendar, Spreadsheets, and Outreach.' },
  { label: 'concierge.quick.executive.label', prompt: 'concierge.quick.executive.prompt', fallbackLabel: '📊 Executive insights', fallbackPrompt: 'Show financial, KPI, CRM, outreach, and forecasting recommendations.' },
  { label: 'concierge.quick.support.label', prompt: 'concierge.quick.support.prompt', fallbackLabel: '💬 HMI support', fallbackPrompt: 'I need step-by-step help using SignalBoost.' },
]

export default function Concierge() {
  const pathname = usePathname()
  const { lang, dict } = useI18n()
  const activeLang = ['en', 'pt', 'es', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const visibleMessages = messages.length
    ? messages
    : [{ role: 'assistant' as const, content: t(dict, 'concierge.greeting', 'Hello, I am the SignalBoost Concierge. Ask me about your workspace, or open FAQ, support, and docs below.') }]

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
      const res = await fetch('/api/concierge', {
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
        { role: 'assistant', content: data.reply || data.error || t(dict, 'concierge.fallback', 'I could not create a response.') },
      ])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: t(dict, 'concierge.connectionError', 'Connection problem. Please try again.') }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" aria-expanded={open} aria-controls="signalboost-concierge-panel" onClick={() => setOpen(value => !value)} style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 999999, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 999, background: 'linear-gradient(135deg,#ffc300,#ff9500)', color: '#111', fontWeight: 900, boxShadow: '0 20px 50px rgba(255,149,0,.35)' }}>
        <span style={{ fontSize: 24 }}>✨</span>
        {t(dict, 'concierge.button', 'Concierge')}
      </button>

      {open && (
        <div id="signalboost-concierge-panel" role="dialog" aria-label={t(dict, 'concierge.title', 'AI Concierge')} className="hero-panel" style={{ position: 'fixed', right: 24, bottom: 100, zIndex: 999999, width: 420, maxWidth: 'calc(100vw - 30px)', padding: 20, color: 'white', borderRadius: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>SignalBoost</div>
              <strong style={{ fontSize: 18 }}>{t(dict, 'concierge.title', 'AI Concierge')}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ResetButton onReset={resetVisibleChat} className="sb-button-ghost" />
              <button onClick={() => setOpen(false)} aria-label={t(dict, 'concierge.close', 'Close concierge')} style={{ background: 'transparent', border: '1px solid var(--border-soft)', color: 'white', width: 34, height: 34, borderRadius: 999, fontSize: 20 }}>
                ×
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Link href="/faq" className="sb-button-ghost" style={{ textDecoration: 'none', fontSize: 12, padding: '8px 10px' }}>❓ {t(dict, 'support.faq', 'FAQ')}</Link>
            <Link href="/support" className="sb-button-ghost" style={{ textDecoration: 'none', fontSize: 12, padding: '8px 10px' }}>✉️ {t(dict, 'support.contact', 'Contact Support')}</Link>
            <Link href="/docs" className="sb-button-ghost" style={{ textDecoration: 'none', fontSize: 12, padding: '8px 10px' }}>📖 {t(dict, 'support.documentation', 'Documentation')}</Link>
          </div>

          <div role="log" aria-live="polite" style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {visibleMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: '10px 12px', borderRadius: 14, background: message.role === 'user' ? 'rgba(59,130,246,.18)' : 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', lineHeight: 1.55, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                {message.content}
              </div>
            ))}
            {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t(dict, 'concierge.thinking', 'Thinking...')}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {QUICK_KEYS.map(item => (
              <button key={item.label} type="button" onClick={() => ask(t(dict, item.prompt, item.fallbackPrompt))} className="sb-button-ghost" style={{ padding: '9px 10px', fontSize: 12 }}>
                {t(dict, item.label, item.fallbackLabel)}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input aria-label={t(dict, 'concierge.placeholder', 'Ask anything...')} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') ask(input) }} className="sb-input" style={{ flex: 1, padding: 12, minWidth: 0 }} placeholder={t(dict, 'concierge.placeholder', 'Ask anything...')} />
            <button type="button" className="sb-button-primary" onClick={() => ask(input)} disabled={loading || !input.trim()}>
              {t(dict, 'concierge.send', 'Send')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
