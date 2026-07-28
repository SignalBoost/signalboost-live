'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import ResetButton from '@/components/ResetButton'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import AssistantMessage from '@/components/AssistantMessage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Message = { role: 'user' | 'assistant'; content: string }
type VideoItem = { title: string; type: string; id: string }

type Attachment = {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string
  isImage: boolean
}
const ATTACH_MAX_BYTES = 10 * 1024 * 1024
const ATTACH_MAX_FILES = 5
const ATTACH_ALLOWED_RE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/(plain|csv|markdown))$/i
const ATTACH_INPUT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,.txt,.md,.csv'
const ASSET_READY_KEY = 'signalboost.concierge.assetReady'
// Credit pack pricing shows only when the activation flag is on (Vercel env:
// NEXT_PUBLIC_CREDITS_ACTIVATION=1). Mirrors the Studio catalog badge gate.
const CREDITS_ACTIVATION = process.env.NEXT_PUBLIC_CREDITS_ACTIVATION === '1'

const QUICK_KEYS = [
  { label: uiCopy('u_b4250a9ea1149165'), prompt: uiCopy('u_4f2714269cb0331b'), fallbackLabel: uiCopy('u_3b3d92b555ac55de'), fallbackPrompt: uiCopy('u_7a05f374f1a70da2') },
  { label: uiCopy('u_2ab0f9400fb49f84'), prompt: uiCopy('u_0fdda4b7ddbc76ac'), fallbackLabel: uiCopy('u_0eca5e75a787d1ef'), fallbackPrompt: uiCopy('u_cf87c1a707a8f27a') },
  { label: uiCopy('u_fa6789ecdb5c77af'), prompt: uiCopy('u_d7f31d96904c133d'), fallbackLabel: uiCopy('u_18a2ba21bd7674ca'), fallbackPrompt: uiCopy('u_44a22127da5007bb') },
  { label: uiCopy('u_35942995bbb434c5'), prompt: uiCopy('u_17349620449f1d40'), fallbackLabel: uiCopy('u_db1f7a80496289f5'), fallbackPrompt: uiCopy('u_b00e13d2de22aee9') },
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
    <div className="flex flex-col gap-2.5">
      {block.before ? <AssistantMessage content={block.before} /> : null}
      {block.videos.map((video, i) => (
        <div key={`${video.id}-${i}`} className="overflow-hidden rounded-xl border border-cyan-300/25 bg-slate-950/90">
          <div className="relative w-full bg-black pb-[56.25%]">
            <iframe
              src={`https://www.youtube.com/embed/${encodeURIComponent(video.id)}`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
          <div className="p-2.5">
            <div className="text-xs font-extrabold leading-snug text-white">{video.title}</div>
            <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] text-cyan-300 underline">{uiCopy('u_058d0772f9b49def')}</a>
          </div>
        </div>
      ))}
      {block.after ? <AssistantMessage content={block.after} /> : null}
    </div>
  )
}

export default function Concierge() {
  const pathname = usePathname()
  const { lang, dict } = useI18n()
  const activeLang = ['en', 'pt', 'es', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [utilityContext, setUtilityContext] = useState<string>('')
  const [assetNotice, setAssetNotice] = useState<{ id: string; title: string } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const conversationIdRef = useRef<string>('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable

      if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpen(false)
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !isTyping) {
        event.preventDefault()
        setOpen(true)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result || ''))
      r.onerror = () => reject(new Error('read failed'))
      r.readAsDataURL(file)
    })
  }

  async function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return
    const incoming = Array.from(fileList)
    const staged: Attachment[] = []
    for (const file of incoming) {
      const okType = ATTACH_ALLOWED_RE.test(file.type) || /\.(txt|md|csv)$/i.test(file.name)
      if (!okType || file.size > ATTACH_MAX_BYTES) continue
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
    if (staged.length) setAttachments(prev => [...prev, ...staged].slice(0, ATTACH_MAX_FILES))
  }

  function removeAttachment(id: string) {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    const key = 'signalboost.concierge.utilityContext'
    const loadUtilityContext = () => {
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return
        const parsed = JSON.parse(raw)
        const report = typeof parsed?.report === 'string' ? parsed.report : ''
        if (!report) return
        setUtilityContext(report.slice(0, 1800))
        setOpen(true)
      } catch { /* ignore malformed lead-magnet context */ }
    }
    loadUtilityContext()
    window.addEventListener('signalboost:concierge-utility-context', loadUtilityContext)
    return () => window.removeEventListener('signalboost:concierge-utility-context', loadUtilityContext)
  }, [])

  // COS Core v1 completion channel: when the FFmpeg/Actions pipeline finishes a
  // branded asset, any Studio surface (e.g. the COSA notification center) writes
  // ASSET_READY_KEY and dispatches the event below. The Concierge then surfaces
  // a localized notification with a direct link to the financial approval card.
  useEffect(() => {
    const loadAssetReady = () => {
      try {
        const raw = window.localStorage.getItem(ASSET_READY_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        const id = typeof parsed?.campaignId === 'string' ? parsed.campaignId : ''
        if (!id) return
        setAssetNotice({ id, title: typeof parsed?.title === 'string' ? parsed.title : '' })
        setOpen(true)
        window.localStorage.removeItem(ASSET_READY_KEY)
      } catch { /* ignore malformed asset-ready payload */ }
    }
    loadAssetReady()
    window.addEventListener('signalboost:concierge-asset-ready', loadAssetReady)
    return () => window.removeEventListener('signalboost:concierge-asset-ready', loadAssetReady)
  }, [])

  const contextualGreeting = utilityContext
    ? `${t(dict, 'concierge.utilityOffer', uiCopy('u_1146632289da6035'))}\n\n${utilityContext}`
    : t(dict, 'concierge.greeting', uiCopy('u_1421683c660a1118'))

  const assetNoticeMessage: Message | null = assetNotice
    ? {
        role: 'assistant',
        content: [
          `${t(dict, 'concierge.assetReady', uiCopy('u_1bb8a06009064bdf'))}${assetNotice.title ? ` “${assetNotice.title}”` : ''}`,
          `[${t(dict, 'concierge.assetReadyCta', uiCopy('u_93b49c3e8754375f'))}](/dashboard/cosa?campaign=${encodeURIComponent(assetNotice.id)})`,
          CREDITS_ACTIVATION ? t(dict, 'credits.packs', uiCopy('u_8676a79f4d20b354')) : '',
        ].filter(Boolean).join('\n\n'),
      }
    : null

  const baseMessages: Message[] = messages.length
    ? messages
    : [{ role: 'assistant' as const, content: contextualGreeting }]
  const visibleMessages = assetNoticeMessage ? [...baseMessages, assetNoticeMessage] : baseMessages

  function resetVisibleChat() {
    setAssetNotice(null)
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
    const nextMessages: Message[] = [...messages, { role: uiCopy('u_f3da45e64f20a4d5'), content: displayContent }]
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
          context: { currentPage: pathname, language: activeLang, conversationId: conversationIdRef.current, utilityReport: utilityContext, cosMode: 'silent_background_planning' },
        }),
      })
      const data = await res.json()
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.reply || data.error || t(dict, 'concierge.fallback', uiCopy('u_e7fd486c3b59325a')) },
      ])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: t(dict, 'concierge.connectionError', uiCopy('u_ea2c2e018b0f3d3f')) }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={open ? 'sb-ai-dock is-open' : 'sb-ai-dock is-collapsed'}>
      {!open && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="signalboost-concierge-panel"
          aria-label={t(dict, 'concierge.button', uiCopy('u_e48928b64011de89'))}
          onClick={() => setOpen(true)}
          className="sb-ai-dock-tab"
          title={t(dict, 'concierge.button', uiCopy('u_03458363c9f92fe0'))}
        >
          <span aria-hidden>✨</span>
          <span>{uiCopy('u_48738160b5b8ea75')}</span>
          <span className="sr-only">{t(dict, 'concierge.button', uiCopy('u_0463a1ebd606f5ff'))}</span>
        </button>
      )}

      {open && (
        <aside
          id="signalboost-concierge-panel"
          role="complementary"
          aria-label={t(dict, 'concierge.title', uiCopy('u_a845836437a970a3'))}
          aria-keyshortcuts="Control+K Meta+K Escape"
          onDragOver={e => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
          onDragLeave={e => { e.preventDefault(); if (e.currentTarget === e.target) setDragOver(false) }}
          onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer?.files || null) }}
          className="sb-ai-dock-panel flex flex-col overflow-hidden border border-white/10 bg-slate-950/92 text-white shadow-2xl shadow-black/70 backdrop-blur-md"
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-cyan-300 bg-slate-950/90 p-6 text-center backdrop-blur-md">
              <div>
                <div className="text-4xl">📎</div>
                <div className="mt-2 text-sm font-extrabold text-cyan-300">{t(dict, 'concierge.dropHere', uiCopy('u_d1604b117bf53395'))}</div>
                <div className="mt-1 text-[11px] text-white/50">{t(dict, 'concierge.dropHint', uiCopy('u_1aebe75d07132e66'))}</div>
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-white/[.045] px-4 py-3 backdrop-blur-md">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.18em] text-cyan-300/80">{uiCopy('u_3c7d5d04d70934e5')}</div>
              <strong className="text-base text-white">{t(dict, 'concierge.title', uiCopy('u_98a3963b0ef0f314'))}</strong>
            </div>
            <div className="flex items-center gap-2">
              <ResetButton onReset={resetVisibleChat} className="sb-button-ghost" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t(dict, 'concierge.close', uiCopy('u_1dca77198e7f086b'))}
                title={t(dict, 'concierge.close', uiCopy('u_f7f1bfe71c68d36e'))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg leading-none text-white outline-none transition hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 bg-white/[.035] px-3.5 py-2.5">
            <Link href="/faq" className="sb-button-ghost text-xs no-underline">❓ {t(dict, 'support.faq', uiCopy('u_ac21aabae0380b68'))}</Link>
            <Link href="/support" className="sb-button-ghost text-xs no-underline">✉️ {t(dict, 'support.contact', uiCopy('u_3f1a0c231f3a2b73'))}</Link>
            <Link href="/docs" className="sb-button-ghost text-xs no-underline">📖 {t(dict, 'support.documentation', uiCopy('u_961221c975f5cdf9'))}</Link>
          </div>

          <div ref={logRef} role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
            {visibleMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={message.role === 'user'
                  ? 'max-w-[88%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md border border-blue-400/35 bg-blue-500/25 px-3.5 py-2.5 text-[13px] leading-6 text-white'
                  : 'max-w-[88%] self-start rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-3.5 py-2.5 text-[13px] leading-6 text-white'}
              >
                {message.role === 'assistant' ? <ConciergeVideoMessage content={message.content} /> : message.content}
              </div>
            ))}
            {loading && <div className="px-1 py-1 text-[13px] text-white/45">{t(dict, 'concierge.thinking', uiCopy('u_66ce234756df4496'))}</div>}
          </div>

          <div className="grid shrink-0 grid-cols-1 gap-2 border-t border-white/10 bg-slate-950/80 px-3.5 py-2 sm:grid-cols-2">
            {QUICK_KEYS.map(item => (
              <button key={item.label} type="button" onClick={() => ask(t(dict, item.prompt, item.fallbackPrompt))} className="sb-button-ghost px-3 py-2 text-xs">
                {t(dict, item.label, item.fallbackLabel)}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 bg-slate-950/90 px-3.5 py-3.5">
            {attachments.length > 0 && (
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {attachments.map(a => (
                  <div key={a.id} className="flex max-w-[180px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.06] py-1 pl-1 pr-1.5">
                    {a.isImage
                      ? <img src={a.dataUrl} alt={a.name} className="h-7 w-7 shrink-0 rounded object-cover" />
                      : <span className="flex h-7 w-7 shrink-0 items-center justify-center text-base">📄</span>}
                    <span className="truncate text-[11px] text-white/80">{a.name}</span>
                    <button type="button" onClick={() => removeAttachment(a.id)} aria-label={t(dict, 'concierge.removeFile', uiCopy('u_7a89bb9949406fb3'))} className="shrink-0 border-0 bg-transparent p-0.5 text-xs leading-none text-white/55">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileInputRef} type="file" multiple accept={ATTACH_INPUT_ACCEPT} onChange={e => { addFiles(e.target.files); e.target.value = '' }} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t(dict, 'concierge.attach', uiCopy('u_a01c16aaf5acbd42'))}
                title={t(dict, 'concierge.attach', uiCopy('u_0d78576b5607d518'))}
                disabled={loading || attachments.length >= ATTACH_MAX_FILES}
                className="h-[42px] w-10 shrink-0 rounded-xl border border-white/10 bg-white/[.06] text-base text-white outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >📎</button>
              <textarea
                ref={inputRef}
                aria-label={t(dict, 'concierge.placeholder', uiCopy('u_03df7d0ed9676af3'))}
                value={input}
                onChange={e => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }}
                rows={1}
                className="sb-input min-w-0 flex-1 resize-none px-3.5 py-2.5 text-[13px] leading-snug"
                style={{ maxHeight: 160, overflowY: 'auto', fontFamily: 'inherit' }}
                placeholder={t(dict, 'concierge.placeholder', uiCopy('u_f96dd1debb5f4ca8'))}
              />
              <button type="button" className="sb-button-primary shrink-0 px-4 py-2.5 text-[13px]" onClick={() => ask(input)} disabled={loading || (!input.trim() && attachments.length === 0)}>
                {t(dict, 'concierge.send', uiCopy('u_1bc7ea5e02b5777d'))}
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
