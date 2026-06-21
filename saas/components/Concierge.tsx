'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import ResetButton from '@/components/ResetButton'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import AssistantMessage from '@/components/AssistantMessage'

type Message = { role: 'user' | 'assistant'; content: string }
type VideoItem = { title: string; type: string; id: string }

// ── File upload (attach images / PDFs / text to a concierge message) ──────────
type Attachment = {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string   // base64 data URL (data:<mime>;base64,<data>)
  isImage: boolean
}
const ATTACH_MAX_BYTES = 10 * 1024 * 1024            // 10MB per file
const ATTACH_MAX_FILES = 5                            // keep the staging row bounded
const ATTACH_ALLOWED_RE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/(plain|csv|markdown))$/i
const ATTACH_INPUT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,.txt,.md,.csv'

const QUICK_KEYS = [
  { label: 'concierge.quick.marketplace.label', prompt: 'concierge.quick.marketplace.prompt', fallbackLabel: '🛰️ Marketplace', fallbackPrompt: 'Guide me through marketplace partners, categories, and bookings.' },
  { label: 'concierge.quick.saas.label', prompt: 'concierge.quick.saas.prompt', fallbackLabel: '🚀 SaaS cockpit', fallbackPrompt: 'Guide me through Promote Business, Reviews, Calendar, Spreadsheets, and Outreach.' },
  { label: 'concierge.quick.executive.label', prompt: 'concierge.quick.executive.prompt', fallbackLabel: '📊 Executive insights', fallbackPrompt: 'Show financial, KPI, CRM, outreach, and forecasting recommendations.' },
  { label: 'concierge.quick.support.label', prompt: 'concierge.quick.support.prompt', fallbackLabel: '💬 Support', fallbackPrompt: 'I need step-by-step help using SignalBoost.' },
]

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

function ConciergeVideoMessage({ content }: { content: string }) {
  const block = extractVideoJson(content)
  if (!block) return <AssistantMessage content={content} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {block.before ? <AssistantMessage content={block.before} /> : null}
      {block.videos.map((video, i) => (
        <div key={`${video.id}-${i}`} style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 12, overflow: 'hidden', background: 'rgba(3,7,18,.85)' }}>
          <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000' }}>
            <iframe
              src={`https://www.youtube.com/embed/${encodeURIComponent(video.id)}`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          </div>
          <div style={{ padding: 9 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>{video.title}</div>
            <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 7, color: '#1af0ff', fontSize: 11, textDecoration: 'underline' }}>
              Open on YouTube ↗
            </a>
          </div>
        </div>
      ))}
      {block.after ? <AssistantMessage content={block.after} /> : null}
    </div>
  )
}

export default function Concierge() {
  const pathname  = usePathname()
  const { lang, dict } = useI18n()
  const activeLang = ['en', 'pt', 'es', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const conversationIdRef = useRef<string>('')

  // Read a File into a base64 data URL.
  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result || ''))
      r.onerror = () => reject(new Error('read failed'))
      r.readAsDataURL(file)
    })
  }

  // Validate + stage dropped/selected files. Silently skips files that are the
  // wrong type or too large, and caps the total count so the layout stays bounded.
  async function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return
    const incoming = Array.from(fileList)
    const staged: Attachment[] = []
    for (const file of incoming) {
      const okType = ATTACH_ALLOWED_RE.test(file.type) || /\.(txt|md|csv)$/i.test(file.name)
      if (!okType) continue
      if (file.size > ATTACH_MAX_BYTES) continue
      try {
        const dataUrl = await readFileAsDataUrl(file)
        staged.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
          isImage: /^image\//.test(file.type),
        })
      } catch { /* skip unreadable file */ }
    }
    if (staged.length) {
      setAttachments(prev => [...prev, ...staged].slice(0, ATTACH_MAX_FILES))
    }
  }

  function removeAttachment(id: string) {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages, loading])

  const visibleMessages = messages.length
    ? messages
    : [{ role: 'assistant' as const, content: t(dict, 'concierge.greeting', 'Hello, I am the SignalBoost Concierge. Ask me about your workspace, or open FAQ, support, and docs below.') }]

  function resetVisibleChat() {
    setInput('')
    setLoading(false)
    setMessages([])
    setAttachments([])
    conversationIdRef.current = ''
  }

  async function ask(text: string) {
    const content = text.trim()
    const staged = attachments
    if ((!content && staged.length === 0) || loading) return

    if (!conversationIdRef.current) conversationIdRef.current = crypto.randomUUID()
    const fileNote = staged.length ? `📎 ${staged.map(a => a.name).join(', ')}` : ''
    const displayContent = [content, fileNote].filter(Boolean).join('\n\n')
    const nextMessages: Message[] = [...messages, { role: 'user', content: displayContent }]
    setMessages(nextMessages)
    setInput('')
    setAttachments([])
    setLoading(true)

    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          attachments: staged.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl })),
          context: { currentPage: pathname, language: activeLang, conversationId: conversationIdRef.current },
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
      <button
        type="button"
        aria-expanded={open}
        aria-controls="signalboost-concierge-panel"
        onClick={() => setOpen(v => !v)}
        style={{
          position:     'fixed',
          right:        24,
          bottom:       24,
          zIndex:       1200,
          border:       'none',
          cursor:       'pointer',
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          padding:      '14px 20px',
          borderRadius: 999,
          background:   'linear-gradient(135deg,#ffc300,#ff9500)',
          color:        '#111',
          fontWeight:   900,
          fontSize:     15,
          boxShadow:    '0 8px 32px rgba(255,149,0,.4)',
        }}
      >
        <span style={{ fontSize: 20 }}>✨</span>
        {t(dict, 'concierge.button', 'Concierge')}
      </button>

      {open && (
        <div
          id="signalboost-concierge-panel"
          role="dialog"
          aria-label={t(dict, 'concierge.title', 'AI Concierge')}
          onDragOver={e => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
          onDragLeave={e => { e.preventDefault(); if (e.currentTarget === e.target) setDragOver(false) }}
          onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer?.files || null) }}
          style={{
            position:     'fixed',
            right:        24,
            bottom:       90,
            zIndex:       1100,
            width:        420,
            maxWidth:     'calc(100vw - 32px)',
            maxHeight:    'calc(100vh - 120px)',
            display:      'flex',
            flexDirection:'column',
            borderRadius: 20,
            overflow:     'hidden',
            background:   '#0f1117',
            border:       '1px solid rgba(255,255,255,.12)',
            boxShadow:    '0 24px 64px rgba(0,0,0,.7)',
            color:        '#fff',
          }}
        >
          {dragOver && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(15,17,23,.92)',
              border: '2px dashed #1af0ff', borderRadius: 20,
              pointerEvents: 'none', textAlign: 'center', padding: 24,
            }}>
              <div>
                <div style={{ fontSize: 34 }}>📎</div>
                <div style={{ color: '#1af0ff', fontWeight: 800, fontSize: 15, marginTop: 8 }}>
                  {t(dict, 'concierge.dropHere', 'Drop files to attach')}
                </div>
                <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, marginTop: 4 }}>
                  {t(dict, 'concierge.dropHint', 'Images, PDFs, or text — up to 10MB each')}
                </div>
              </div>
            </div>
          )}
          <div style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
            padding:        '16px 18px 12px',
            borderBottom:   '1px solid rgba(255,255,255,.08)',
            background:     '#13161f',
            flexShrink:     0,
          }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase' }}>SignalBoost</div>
              <strong style={{ fontSize: 16, color: '#fff' }}>{t(dict, 'concierge.title', 'AI Concierge')}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ResetButton onReset={resetVisibleChat} className="sb-button-ghost" />
              <button
                onClick={() => setOpen(false)}
                aria-label={t(dict, 'concierge.close', 'Close concierge')}
                style={{
                  background:   'rgba(255,255,255,.08)',
                  border:       '1px solid rgba(255,255,255,.12)',
                  color:        '#fff',
                  width:        32,
                  height:       32,
                  borderRadius: 999,
                  fontSize:     18,
                  cursor:       'pointer',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  lineHeight:   1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{
            display:       'flex',
            gap:           8,
            flexWrap:      'wrap',
            padding:       '10px 14px',
            borderBottom:  '1px solid rgba(255,255,255,.06)',
            background:    '#13161f',
            flexShrink:    0,
          }}>
            <Link href="/faq"     className="sb-button-ghost" style={{ textDecoration: 'none', fontSize: 12, padding: '6px 10px' }}>❓ {t(dict, 'support.faq', 'FAQ')}</Link>
            <Link href="/support" className="sb-button-ghost" style={{ textDecoration: 'none', fontSize: 12, padding: '6px 10px' }}>✉️ {t(dict, 'support.contact', 'Contact')}</Link>
            <Link href="/docs"    className="sb-button-ghost" style={{ textDecoration: 'none', fontSize: 12, padding: '6px 10px' }}>📖 {t(dict, 'support.documentation', 'Docs')}</Link>
          </div>

          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            style={{
              flex:          1,
              overflowY:     'auto',
              padding:       '14px 14px 8px',
              display:       'flex',
              flexDirection: 'column',
              gap:           10,
              minHeight:     0,
            }}
          >
            {visibleMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  alignSelf:  message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth:   '88%',
                  padding:    '10px 14px',
                  borderRadius: message.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: message.role === 'user'
                    ? 'rgba(59,130,246,.30)'
                    : 'rgba(255,255,255,.10)',
                  border:     message.role === 'user'
                    ? '1px solid rgba(59,130,246,.4)'
                    : '1px solid rgba(255,255,255,.12)',
                  lineHeight:  1.6,
                  fontSize:    13,
                  color:       '#fff',
                  whiteSpace:  message.role === 'user' ? 'pre-wrap' : 'normal',
                }}
              >
                {message.role === 'assistant'
                  ? <ConciergeVideoMessage content={message.content} />
                  : message.content}
              </div>
            ))}
            {loading && (
              <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, padding: '4px 0' }}>
                {t(dict, 'concierge.thinking', 'Thinking...')}
              </div>
            )}
          </div>

          <div style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 8,
            padding:             '8px 14px',
            borderTop:           '1px solid rgba(255,255,255,.06)',
            background:          '#0f1117',
            flexShrink:          0,
          }}>
            {QUICK_KEYS.map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => ask(t(dict, item.prompt, item.fallbackPrompt))}
                className="sb-button-ghost"
                style={{ padding: '8px 10px', fontSize: 12 }}
              >
                {t(dict, item.label, item.fallbackLabel)}
              </button>
            ))}
          </div>

          <div style={{
            display:       'flex',
            flexDirection: 'column',
            gap:           8,
            padding:       '10px 14px 14px',
            background:    '#0f1117',
            flexShrink:    0,
          }}>
            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 92, overflowY: 'auto' }}>
                {attachments.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
                    borderRadius: 8, padding: '4px 6px 4px 4px', maxWidth: 180,
                  }}>
                    {a.isImage
                      ? <img src={a.dataUrl} alt={a.name} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                      : <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📄</span>}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={t(dict, 'concierge.removeFile', 'Remove file')}
                      style={{ flexShrink: 0, background: 'none', border: 0, color: 'rgba(255,255,255,.55)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 2 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACH_INPUT_ACCEPT}
                onChange={e => { addFiles(e.target.files); e.target.value = '' }}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t(dict, 'concierge.attach', 'Attach files')}
                title={t(dict, 'concierge.attach', 'Attach files')}
                disabled={loading || attachments.length >= ATTACH_MAX_FILES}
                style={{
                  flexShrink: 0, width: 38, padding: '10px 0',
                  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 10, color: '#fff', fontSize: 16, cursor: 'pointer',
                  opacity: (loading || attachments.length >= ATTACH_MAX_FILES) ? 0.4 : 1,
                }}
              >📎</button>
              <input
                aria-label={t(dict, 'concierge.placeholder', 'Ask anything...')}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') ask(input) }}
                className="sb-input"
                style={{ flex: 1, padding: '10px 14px', minWidth: 0, fontSize: 13 }}
                placeholder={t(dict, 'concierge.placeholder', 'Ask anything...')}
              />
              <button
                type="button"
                className="sb-button-primary"
                onClick={() => ask(input)}
                disabled={loading || (!input.trim() && attachments.length === 0)}
                style={{ padding: '10px 16px', fontSize: 13, flexShrink: 0 }}
              >
                {t(dict, 'concierge.send', 'Send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
