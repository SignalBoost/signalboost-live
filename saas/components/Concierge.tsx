'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import ResetButton from '@/components/ResetButton'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'
import AssistantMessage from '@/components/AssistantMessage'
import { uiText } from '@/lib/i18n/uiText'

type FeedbackKind = 'positive' | 'negative' | 'correction'
type FeedbackUiState = { status: 'idle' | 'saving' | 'saved' | 'error'; kind?: FeedbackKind; correctionOpen?: boolean; correction?: string; error?: string }
type Message = {
  role: 'user' | 'assistant'
  content: string
  feedbackPrompt?: string
  feedbackEligible?: boolean
  suggestedFollowups?: string[]
}
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
// The server primary is bounded at 150 s. Give public recovery/serialization another minute, then
// stop waiting well before Vercel's 300 s function ceiling so a lost socket can never spin forever.
const CONCIERGE_CLIENT_DEADLINE_MS = 210_000
// Credit pack pricing shows only when the activation flag is on (Vercel env:
// NEXT_PUBLIC_CREDITS_ACTIVATION=1). Mirrors the Studio catalog badge gate.
const CREDITS_ACTIVATION = process.env.NEXT_PUBLIC_CREDITS_ACTIVATION === '1'

const QUICK_KEYS = [
  { label: uiText('generatedUi.u_6335d08d85da3e7b'), prompt: uiText('generatedUi.u_84a03ef670ff79ed'), fallbackLabel: uiText('generatedUi.u_1ba7d352a9f1fa5f'), fallbackPrompt: uiText('generatedUi.u_0c5e0831d35e7a97') },
  { label: uiText('generatedUi.u_b0634a9f132ceaa2'), prompt: uiText('generatedUi.u_f5aa13a181d67763'), fallbackLabel: uiText('generatedUi.u_73768e829b6c06da'), fallbackPrompt: uiText('generatedUi.u_ea7f02660b70d052') },
  { label: uiText('generatedUi.u_f6f60196969b96d6'), prompt: uiText('generatedUi.u_4b556d8821600ce9'), fallbackLabel: uiText('generatedUi.u_79a77fbd60dff21a'), fallbackPrompt: uiText('generatedUi.u_e0264e7ca3506fe8') },
  { label: uiText('generatedUi.u_733850cd9e69d0b8'), prompt: uiText('generatedUi.u_92c64d72af2a4ed3'), fallbackLabel: uiText('generatedUi.u_1d5fbdb3d68c99e8'), fallbackPrompt: uiText('generatedUi.u_cf70b37dfd8b0e21') },
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
            <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] text-cyan-300 underline">{uiText('generatedUi.u_da49fb7ef1ca2911')}</a>
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
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<number, FeedbackUiState>>({})
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
  const requestAbortRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    requestAbortRef.current?.abort()
    requestAbortRef.current = null
  }, [])

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
    ? `${t(dict, 'concierge.utilityOffer')}\n\n${utilityContext}`
    : t(dict, 'concierge.greeting')

  const assetNoticeMessage: Message | null = assetNotice
    ? {
        role: 'assistant',
        content: [
          `${t(dict, 'concierge.assetReady')}${assetNotice.title ? ` “${assetNotice.title}”` : ''}`,
          `[${t(dict, 'concierge.assetReadyCta')}](/dashboard/cosa?campaign=${encodeURIComponent(assetNotice.id)})`,
          CREDITS_ACTIVATION ? t(dict, 'credits.packs') : '',
        ].filter(Boolean).join('\n\n'),
      }
    : null

  const baseMessages: Message[] = messages.length
    ? messages
    : [{ role: 'assistant' as const, content: contextualGreeting }]
  const visibleMessages = assetNoticeMessage ? [...baseMessages, assetNoticeMessage] : baseMessages

  function resetVisibleChat() {
    requestAbortRef.current?.abort()
    requestAbortRef.current = null
    setAssetNotice(null)
    setInput('')
    setLoading(false)
    setMessages([])
    setFeedbackByMessage({})
    setAttachments([])
    conversationIdRef.current = ''
  }

  async function submitFeedback(messageIndex: number, message: Message, feedbackType: FeedbackKind, correctionText?: string) {
    const conversationId = conversationIdRef.current
    if (!conversationId || !message.feedbackEligible || !message.feedbackPrompt || !message.content.trim()) return
    const current = feedbackByMessage[messageIndex]
    if (current?.status === 'saving') return
    setFeedbackByMessage(prev => ({ ...prev, [messageIndex]: { ...prev[messageIndex], status: 'saving', kind: feedbackType } }))
    try {
      const response = await fetch('/api/assistant/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          assistantContent: message.content,
          userPrompt: message.feedbackPrompt,
          feedbackType,
          correctionText,
        }),
      })
      const payload = await response.json().catch(() => null) as { error?: unknown } | null
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `feedback_http_${response.status}`)
      setFeedbackByMessage(prev => ({ ...prev, [messageIndex]: { status: 'saved', kind: feedbackType, correctionOpen: false, correction: '' } }))
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message.slice(0, 220) : ''
      setFeedbackByMessage(prev => ({ ...prev, [messageIndex]: { ...prev[messageIndex], status: 'error', kind: feedbackType, error: detail } }))
    }
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

    const controller = new AbortController()
    requestAbortRef.current = controller
    const deadline = window.setTimeout(() => controller.abort(), CONCIERGE_CLIENT_DEADLINE_MS)

    try {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages,
          attachments: staged.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl })),
          // timezone: the visitor's OWN browser zone, read with zero user input.
          // Missing here meant every "what date is today" from a real visitor near
          // midnight UTC could land on the wrong calendar day (deterministicUtilities
          // defaults to UTC when none is supplied) — caught Aug 12 testing from
          // Nicaragua, UTC-6, where UTC had already rolled to the next day locally.
          context: { currentPage: pathname, language: activeLang, conversationId: conversationIdRef.current, utilityReport: utilityContext, cosMode: 'silent_background_planning', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        }),
      })
      const data = await res.json()
      if (requestAbortRef.current !== controller) return
      const reply = data.reply || data.error || t(dict, 'concierge.fallback')
      const turnId = data?.execution_provenance?.turnId
      const feedbackEligible = typeof turnId === 'string' && turnId.trim().length > 0 && Boolean(data?.reply)
      const suggestedFollowups = Array.isArray(data?.suggested_followups)
        ? data.suggested_followups.filter((value: unknown): value is string => typeof value === 'string').slice(0, 2)
        : []
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: reply,
          ...(feedbackEligible ? { feedbackPrompt: content, feedbackEligible: true } : {}),
          ...(suggestedFollowups.length === 2 ? { suggestedFollowups } : {}),
        },
      ])
    } catch {
      // Reset/unmount intentionally aborts the old request. Do not let its completion append an
      // error to a cleared chat or release loading state underneath a newer request.
      if (controller.signal.aborted && requestAbortRef.current !== controller) return
      setMessages(prev => [...prev, { role: 'assistant', content: t(dict, 'concierge.connectionError') }])
    } finally {
      window.clearTimeout(deadline)
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = null
        setLoading(false)
      }
    }
  }

  return (
    <div className={open ? 'sb-ai-dock is-open' : 'sb-ai-dock is-collapsed'}>
      {!open && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="signalboost-concierge-panel"
          aria-label={t(dict, 'concierge.button')}
          onClick={() => setOpen(true)}
          className="sb-ai-dock-tab"
          title={t(dict, 'concierge.button')}
        >
          <span aria-hidden>✨</span>
          <span>{uiText('generatedUi.u_6fd6628dffd218e9')}</span>
          <span className="sr-only">{t(dict, 'concierge.button')}</span>
        </button>
      )}

      {open && (
        <aside
          id="signalboost-concierge-panel"
          role="complementary"
          aria-label={t(dict, 'concierge.title')}
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
                <div className="mt-2 text-sm font-extrabold text-cyan-300">{t(dict, 'concierge.dropHere')}</div>
                <div className="mt-1 text-[11px] text-white/50">{t(dict, 'concierge.dropHint')}</div>
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-white/[.045] px-4 py-3 backdrop-blur-md">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[.18em] text-cyan-300/80">{uiText('generatedUi.u_85647deec9865df5')}</div>
              <strong className="text-base text-white">{t(dict, 'concierge.title')}</strong>
            </div>
            <div className="flex items-center gap-2">
              <ResetButton onReset={resetVisibleChat} className="sb-button-ghost" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t(dict, 'concierge.close')}
                title={t(dict, 'concierge.close')}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg leading-none text-white outline-none transition hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 bg-white/[.035] px-3.5 py-2.5">
            <Link href="/faq" className="sb-button-ghost text-xs no-underline">❓ {t(dict, 'support.faq')}</Link>
            <Link href="/support" className="sb-button-ghost text-xs no-underline">✉️ {t(dict, 'support.contact')}</Link>
            <Link href="/docs" className="sb-button-ghost text-xs no-underline">📖 {t(dict, 'support.documentation')}</Link>
          </div>

          <div ref={logRef} role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
            {visibleMessages.map((message, index) => {
              const feedback = feedbackByMessage[index] || { status: 'idle' as const }
              const busy = feedback.status === 'saving'
              const correction = feedback.correction || ''
              return (
                <div
                  key={`${message.role}-${index}`}
                  className={message.role === 'user'
                    ? 'max-w-[88%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md border border-blue-400/35 bg-blue-500/25 px-3.5 py-2.5 text-[13px] leading-6 text-white'
                    : 'max-w-[88%] self-start rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-3.5 py-2.5 text-[13px] leading-6 text-white'}
                >
                  {message.role === 'assistant' ? <ConciergeVideoMessage content={message.content} /> : message.content}
                  {message.role === 'assistant' && message.suggestedFollowups?.length === 2 ? (
                    <div className="mt-3 border-t border-white/10 pt-2.5">
                      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-white/55">Continue</div>
                      <div className="flex flex-col items-start gap-1.5">
                        {message.suggestedFollowups.map(followup => (
                          <button key={followup} type="button" disabled={loading} onClick={() => ask(followup)} className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1.5 text-left text-[11.5px] leading-snug text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50">
                            {followup}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {message.role === 'assistant' && message.feedbackEligible && message.feedbackPrompt ? (
                    <div className="mt-2.5 border-t border-white/10 pt-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" disabled={busy || feedback.status === 'saved'} onClick={() => submitFeedback(index, message, 'positive')} className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10.5px] text-emerald-200 disabled:opacity-50">👍 {uiText('assistantFeedback.helpful')}</button>
                        <button type="button" disabled={busy || feedback.status === 'saved'} onClick={() => submitFeedback(index, message, 'negative')} className="rounded-lg border border-red-400/30 bg-red-400/10 px-2 py-1 text-[10.5px] text-red-200 disabled:opacity-50">👎 {uiText('assistantFeedback.notHelpful')}</button>
                        <button type="button" disabled={busy || feedback.status === 'saved'} onClick={() => setFeedbackByMessage(prev => ({ ...prev, [index]: { ...(prev[index] || { status: 'idle' }), correctionOpen: true, correction: prev[index]?.correction || '' } }))} className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-[10.5px] text-cyan-200 disabled:opacity-50">✎ {uiText('assistantFeedback.correctThis')}</button>
                        {feedback.status === 'saved' ? <span className="text-[10.5px] text-emerald-200">{uiText('assistantFeedback.feedbackSaved')}</span> : null}
                        {feedback.status === 'error' ? <span className="text-[10.5px] text-red-200">{feedback.error || uiText('assistantFeedback.feedbackError')}</span> : null}
                      </div>
                      {feedback.correctionOpen && feedback.status !== 'saved' ? (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <textarea
                            value={correction}
                            onChange={e => setFeedbackByMessage(prev => ({ ...prev, [index]: { ...(prev[index] || { status: 'idle' }), correctionOpen: true, correction: e.target.value } }))}
                            placeholder={uiText('assistantFeedback.correctionPlaceholder')}
                            rows={3}
                            maxLength={4000}
                            className="w-full resize-y rounded-lg border border-white/15 bg-slate-950/70 px-2 py-1.5 text-[11px] text-white outline-none focus:border-cyan-300/50"
                          />
                          <div className="flex gap-1.5">
                            <button type="button" disabled={busy || !correction.trim()} onClick={() => submitFeedback(index, message, 'correction', correction)} className="rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-2 py-1 text-[10.5px] font-bold text-cyan-200 disabled:opacity-50">{uiText('assistantFeedback.submitCorrection')}</button>
                            <button type="button" disabled={busy} onClick={() => setFeedbackByMessage(prev => ({ ...prev, [index]: { ...(prev[index] || { status: 'idle' }), correctionOpen: false } }))} className="rounded-lg border border-white/15 px-2 py-1 text-[10.5px] text-white/65 disabled:opacity-50">{uiText('assistantFeedback.cancelCorrection')}</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {loading && <div className="px-1 py-1 text-[13px] text-white/45">{t(dict, 'concierge.thinking')}</div>}
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
                    <button type="button" onClick={() => removeAttachment(a.id)} aria-label={t(dict, 'concierge.removeFile')} className="shrink-0 border-0 bg-transparent p-0.5 text-xs leading-none text-white/55">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileInputRef} type="file" multiple accept={ATTACH_INPUT_ACCEPT} onChange={e => { addFiles(e.target.files); e.target.value = '' }} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t(dict, 'concierge.attach')}
                title={t(dict, 'concierge.attach')}
                disabled={loading || attachments.length >= ATTACH_MAX_FILES}
                className="h-[42px] w-10 shrink-0 rounded-xl border border-white/10 bg-white/[.06] text-base text-white outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
              >📎</button>
              <textarea
                ref={inputRef}
                aria-label={t(dict, 'concierge.placeholder')}
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
                placeholder={t(dict, 'concierge.placeholder')}
              />
              <button type="button" className="sb-button-primary shrink-0 px-4 py-2.5 text-[13px]" onClick={() => ask(input)} disabled={loading || (!input.trim() && attachments.length === 0)}>
                {t(dict, 'concierge.send')}
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
