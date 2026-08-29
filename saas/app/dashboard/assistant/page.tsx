// saas/app/dashboard/assistant/page.tsx
'use client'

import { useEffect, useRef, useState, DragEvent, ChangeEvent } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import AssistantMessage from '@/components/AssistantMessage'
import { uiText } from '@/lib/i18n/uiText'
import { ASSISTANT_TRANSPORT_TIMEOUT_COPY, findRecoveredAssistantReply } from '@/lib/ai/cos/assistantTransportRecovery'
import { isCosCodingObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Msg = { role: 'user' | 'assistant'; content: string }
type FeedbackKind = 'positive' | 'negative' | 'correction'
type FeedbackUiState = { status: 'idle' | 'saving' | 'saved' | 'error'; kind?: FeedbackKind; correctionOpen?: boolean; correction?: string }
type ConvSummary = { id: string; title: string; summary: string; message_count: number; updated_at: string }
type VideoItem = { title: string; type: string; id: string }

// ── Attachment types ──────────────────────────────────────────────────────────
type StagedFile = {
  id: string
  name: string
  size: number
  mimeType: string
  dataUrl: string   // base64 data-URL for images; plain base64 for others
  isImage: boolean
}

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv', 'text/markdown',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const BUILDER_HANDOFF_FILES_KEY = 'cos-builder-handoff-files-v1'

// ── Copy ─────────────────────────────────────────────────────────────────────
const COPY = {
  eyebrow:      { en: uiText('generatedUi.u_391e405152779acc'),                              es: 'Asistente',                           pt: 'Assistente',                          pl: 'Asystent',                            ru: 'Ассистент' },
  title:        { en: uiText('generatedUi.u_a782daf5eb4fa466'),             es: 'Tu concierge de SignalBoost',         pt: 'Seu concierge SignalBoost',            pl: 'Twój concierge SignalBoost',           ru: 'Ваш консьерж SignalBoost' },
  subtitle:     { en: uiText('generatedUi.u_c20643751715e605'), es: 'Pregunta sobre construcción, promoción, reseñas, audio, video o tu cuenta.', pt: 'Pergunte sobre construção, promoção, avaliações, áudio, vídeo ou sua conta.', pl: 'Pytaj o budowanie, promocję, opinie, audio, wideo lub swoje konto.', ru: 'Спрашивайте о создании, продвижении, отзывах, аудио, видео или вашем аккаунте.' },
  empty:        { en: uiText('generatedUi.u_ca65397e2779502a'),                                     es: 'Pregúntame lo que quieras, o empieza con una de estas:',                          pt: 'Pergunte-me qualquer coisa, ou comece com uma destas:',                        pl: 'Zapytaj mnie o cokolwiek lub zacznij od jednego z tych:',                      ru: 'Спросите меня что угодно или начните с одного из вариантов:' },
  thinking:     { en: uiText('generatedUi.u_a02f1cea3c1d6c6e'),                             es: 'Pensando…',                           pt: 'Pensando…',                            pl: 'Myślę…',                               ru: 'Думаю…' },
  placeholder:  { en: uiText('generatedUi.u_2efcbbb4418f49eb'),                    es: 'Pregunta al concierge…',              pt: 'Pergunte ao concierge…',               pl: 'Zapytaj concierge…',                   ru: 'Спросите консьержа…' },
  send:         { en: uiText('generatedUi.u_f6f4688ff23d50c6'),                                   es: 'Enviar',                              pt: 'Enviar',                               pl: 'Wyślij',                               ru: 'Отправить' },
  error:        { en: uiText('generatedUi.u_7a8adaf287716b05'), es: 'Lo siento, no pude responder eso ahora mismo.', pt: 'Desculpe, não pude responder isso agora.', pl: 'Przepraszam, nie mogłem teraz odpowiedzieć.', ru: 'Извините, не могу ответить прямо сейчас.' },
  stopped:      { en: uiText('generatedUi.u_dfca6272ec004413'), es: 'Solicitud detenida. No se envió nada ni se realizó ninguna acción externa.', pt: 'Solicitação interrompida. Nada foi enviado e nenhuma ação externa foi realizada.', pl: 'Żądanie zatrzymane. Nic nie zostało wysłane i nie wykonano żadnej czynności zewnętrznej.', ru: 'Запрос остановлен. Ничего не отправлено, внешние действия не выполнялись.' },
  timedOut:     ASSISTANT_TRANSPORT_TIMEOUT_COPY,
  stop:         { en: uiText('generatedUi.u_cae7d57bc067a514'), es: 'Detener', pt: 'Parar', pl: 'Zatrzymaj', ru: 'Остановить' },
  history:      { en: uiText('generatedUi.u_0e76960093379060'),                               es: 'Historial',                           pt: 'Histórico',                            pl: 'Historia',                             ru: 'История' },
  newChat:      { en: uiText('generatedUi.u_db18382a249e0206'),                               es: 'Nuevo chat',                          pt: 'Novo chat',                            pl: 'Nowy czat',                            ru: 'Новый чат' },
  noHistory:    { en: uiText('generatedUi.u_52a8737366b2b6bd'),                  es: 'Aún no hay conversaciones.',          pt: 'Ainda não há conversas.',              pl: 'Brak rozmów.',                         ru: 'Пока нет разговоров.' },
  loadingHistory: { en: uiText('generatedUi.u_ba3bbbe10d8bef66'),                            es: 'Cargando…',                           pt: 'Carregando…',                          pl: 'Ładowanie…',                           ru: 'Загрузка…' },
  historyError: { en: uiText('generatedUi.u_b99f2969347b9565'),               es: 'No se pudo cargar el historial.',     pt: 'Não foi possível carregar o histórico.', pl: 'Nie udało się załadować historii.',   ru: 'Ошибка загрузки истории.' },
  deleteConfirm: { en: uiText('generatedUi.u_333e9b74d8484f03'),            es: '¿Eliminar esta conversación?',        pt: 'Excluir esta conversa?',               pl: 'Usunąć tę rozmowę?',                   ru: 'Удалить этот разговор?' },
  untitled:     { en: uiText('generatedUi.u_31d248c4457997d6'),                 es: 'Conversación sin título',             pt: 'Conversa sem título',                  pl: 'Rozmowa bez tytułu',                   ru: 'Разговор без названия' },
  close:        { en: uiText('generatedUi.u_7d9eb7acb13e2462'),                                  es: 'Cerrar',                              pt: 'Fechar',                               pl: 'Zamknij',                              ru: 'Закрыть' },
  dropHere:     { en: uiText('generatedUi.u_37fcbf3020fb0d9e'),                       es: 'Suelta archivos aquí',                pt: 'Solte arquivos aqui',                  pl: 'Upuść pliki tutaj',                    ru: 'Перетащите файлы сюда' },
  fileTooLarge: { en: uiText('generatedUi.u_a096aa68b2cd25b2'),            es: 'Archivo demasiado grande (máx 10 MB)', pt: 'Arquivo muito grande (máx 10 MB)',    pl: 'Plik za duży (maks. 10 MB)',           ru: 'Файл слишком большой (макс. 10 МБ)' },
  fileTypeErr:  { en: uiText('generatedUi.u_8ae7419118b2f46d'),               es: 'Tipo de archivo no admitido',         pt: 'Tipo de arquivo não suportado',        pl: 'Nieobsługiwany typ pliku',             ru: 'Тип файла не поддерживается' },
  suggestions: {
    s1: { en: uiText('generatedUi.u_4f752fa3389e5d4d'),            es: '¿Cómo publico mi primer sitio web?',  pt: 'Como publico meu primeiro site?',      pl: 'Jak opublikować moją pierwszą stronę?', ru: 'Как опубликовать первый сайт?' },
    s2: { en: uiText('generatedUi.u_855091b131fbf6b2'),             es: 'Ayúdame a planificar una campaña de prospección', pt: 'Me ajude a planejar uma campanha de prospecção', pl: 'Pomóż mi zaplanować kampanię outreach', ru: 'Помоги спланировать кампанию аутрич' },
    s3: { en: uiText('generatedUi.u_8d37984c3f94d6e8'),                    es: '¿Qué incluye mi plan?',               pt: 'O que inclui meu plano?',              pl: 'Co zawiera mój plan?',                 ru: 'Что включает мой план?' },
    s4: { en: uiText('generatedUi.u_e51721c029889884'),            es: '¿Cómo recopilo reseñas de clientes?', pt: 'Como coleo avaliações de clientes?',   pl: 'Jak zbierać opinie klientów?',         ru: 'Как собирать отзывы клиентów?' },
  },
}

const DATE_LOCALES: Record<Lang, string> = { en: uiText('generatedUi.u_5c49f88dafe66e0e'), es: 'es-MX', pt: 'pt-BR', pl: 'pl-PL', ru: 'ru-RU' }
const RECOVERY_POLL_DELAYS_MS = [0, 900, 2_100]

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

async function recoverCompletedTurn(conversationId: string, userContent: string, sentAtMs: number): Promise<string | null> {
  if (!conversationId || !userContent.trim()) return null

  for (const delayMs of RECOVERY_POLL_DELAYS_MS) {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
    try {
      const res = await fetch(`/api/assistant/chats?id=${encodeURIComponent(conversationId)}`, { cache: 'no-store' })
      if (!res.ok) continue
      const data = await res.json()
      const recovered = findRecoveredAssistantReply(
        Array.isArray(data?.messages) ? data.messages : [],
        userContent,
        sentAtMs,
      )
      if (recovered) return recovered
    } catch {
      // The recovery read uses a separate request. If the network itself is down,
      // keep the original transport error rather than retrying the POST.
    }
  }

  return null
}

// ── Video JSON legacy renderer ────────────────────────────────────────────────
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
      .map((v: any) => ({ title: typeof v?.title === 'string' ? v.title : 'Video', type: typeof v?.type === 'string' ? v.type : 'video', id: typeof v?.id === 'string' ? v.id : '' }))
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
              <iframe src={`https://www.youtube.com/embed/${encodeURIComponent(video.id)}`} title={video.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>{video.title}</div>
              <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, color: '#1af0ff', fontSize: 11.5, textDecoration: 'underline' }}>{uiText('generatedUi.u_da49fb7ef1ca2911')}</a>
            </div>
          </div>
        ))}
      </div>
      {block.after ? <AssistantMessage content={block.after} /> : null}
    </div>
  )
}

// ── File helpers ──────────────────────────────────────────────────────────────
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function builderFilesFromStaged(files: readonly StagedFile[]): Array<{ path: string; content: string }> | null {
  const supported = files.filter(file => file.mimeType.startsWith('text/') || file.mimeType === 'application/json')
  if (supported.length !== files.length || supported.length > 20 || supported.some(file => file.size > 512 * 1024)) return null
  try {
    return supported.map(file => {
      const encoded = file.dataUrl.slice(file.dataUrl.indexOf(',') + 1)
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
      return { path: file.name, content: new TextDecoder().decode(bytes) }
    })
  } catch { return null }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssistantPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  const [messages, setMessages] = useState<Msg[]>([])
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<number, FeedbackUiState>>({})
  const [input, setInput] = useState('')
  useEffect(() => {
    const prompt = new URLSearchParams(window.location.search).get('prompt')?.trim()
    if (prompt) setInput(prompt.slice(0, 8000))
  }, [])
  const [loading, setLoading] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef<string>('')
  // The page keeps a hard upper bound so a genuinely lost request cannot spin forever.
  // If the POST response is lost after the server persisted the turn, the catch path below
  // recovers that exact answer from conversation history rather than resending the POST.
  const abortRef = useRef<AbortController | null>(null)
  const CLIENT_DEADLINE_MS = 290_000

  // Attachment state
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // History state
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [cosStatus, setCosStatus] = useState<{ mode: string; detail: string; isOwner: boolean } | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/cos/status', { credentials: 'include', cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (alive && j?.ok) setCosStatus({ mode: String(j.mode), detail: String(j.detail || ''), isOwner: Boolean(j.isOwner) }) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

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

  // ── File processing ─────────────────────────────────────────────────────────
  async function processFiles(fileList: FileList | File[]) {
    setFileError('')
    const files = Array.from(fileList)
    const results: StagedFile[] = []

    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.type)) {
        setFileError(c(COPY.fileTypeErr, l))
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        setFileError(c(COPY.fileTooLarge, l))
        continue
      }
      try {
        const dataUrl = await readFileAsDataUrl(file)
        results.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          mimeType: file.type,
          dataUrl,
          isImage: file.type.startsWith('image/'),
        })
      } catch {
        // skip unreadable files silently
      }
    }

    if (results.length > 0) {
      setStagedFiles(prev => [...prev, ...results])
    }
  }

  // ── Drag-and-drop handlers ──────────────────────────────────────────────────
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer?.files?.length) {
      processFiles(e.dataTransfer.files)
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      processFiles(e.target.files)
      // reset so the same file can be re-selected
      e.target.value = ''
    }
  }

  function removeFile(id: string) {
    setStagedFiles(prev => prev.filter(f => f.id !== id))
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  async function send(text: string) {
    const content = text.trim()
    if ((!content && stagedFiles.length === 0) || loading) return
    // Builder is an authenticated product surface. Do not let public Concierge inherit this handoff.
    const builderFiles = builderFilesFromStaged(stagedFiles)
    if (content && isCosCodingObjective(content)) {
      if (builderFiles.length) sessionStorage.setItem(BUILDER_HANDOFF_FILES_KEY, JSON.stringify(builderFiles))
      window.location.assign(`/dashboard/developer?objective=${encodeURIComponent(content)}`)
      return
    }
    if (!conversationIdRef.current) conversationIdRef.current = crypto.randomUUID()

    // Build a user-facing label that includes file names
    const fileLabel = stagedFiles.length
      ? `\n\n📎 ${stagedFiles.map(f => f.name).join(', ')}`
      : ''
    const displayContent = content + fileLabel

    const next: Msg[] = [...messages, { role: 'user', content: displayContent }]
    setMessages(next)
    setInput('')
    const filesToSend = stagedFiles.slice()
    setStagedFiles([])
    setFileError('')
    setLoading(true)

    try {
      // Build the message history without the file-label suffix for the API
      const apiMessages = next.map((m, i) => {
        if (i === next.length - 1 && m.role === 'user' && fileLabel) {
          return { role: m.role, content: content }
        }
        return m
      })

      // Serialize attachments as lightweight descriptors + base64 data
      const attachments = filesToSend.map(f => ({
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        dataUrl: f.dataUrl,
      }))

      const controller = new AbortController()
      abortRef.current = controller
      let hitDeadline = false
      const sentAtMs = Date.now()
      const conversationId = conversationIdRef.current
      const deadline = setTimeout(() => { hitDeadline = true; controller.abort() }, CLIENT_DEADLINE_MS)

      try {
        // Owner-verified fix (2026-08-24): this page previously posted to /api/concierge, which
        // deliberately wraps every request in public-only delivery scope ("an owner/admin browser
        // session can never promote this endpoint") — so getAccess() returned GUEST for the owner
        // too, and the personal assistant was architecturally identical to the public Concierge.
        // /api/cos-primary performs real access detection, so the owner is answered as the owner.
        const res = await fetch('/api/cos-primary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: apiMessages,
            attachments: attachments.length ? attachments : undefined,
            context: { language: lang, currentPage: '/dashboard/assistant', conversationId },
          }),
        })

        // A gateway timeout or crash returns HTML, not JSON. Parsing it blindly
        // threw and produced a generic error with no explanation of what happened.
        const raw = await res.text()
        let data: any = null
        try { data = JSON.parse(raw) } catch { data = null }

        // If the response envelope itself is missing, first try the durable turn that
        // the server may already have persisted. Never resend the POST: owner requests
        // can mutate state, so replaying them would risk duplicate actions.
        const directReply = data?.reply || data?.error || ''
        if (!directReply) {
          const recovered = await recoverCompletedTurn(conversationId, content, sentAtMs)
          if (recovered) {
            setMessages([...next, { role: 'assistant', content: recovered }])
            return
          }
        }

        // Surface WHY it failed. The bare generic message told the owner nothing —
        // a 500, a 200 with an empty body, and a dropped connection all looked
        // identical, so a failing request could not be diagnosed without server logs.
        const gateway = res.status === 504 || res.status === 408 || res.status === 524
        const detail = `[${res.status}] ${String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 300)}`.trim()
        const fallback = gateway ? c(COPY.timedOut, l) : `${c(COPY.error, l)} ${detail}`
        const reply = directReply || fallback
        setMessages([...next, { role: 'assistant', content: reply }])
      } catch (err: any) {
        const aborted = err?.name === 'AbortError'

        // A deliberate Stop must remain a stop. For deadline/network failures, however,
        // the server may have completed and persisted the answer even though the browser
        // lost the response. Recover that exact turn by conversation id + send timestamp.
        if (!(aborted && !hitDeadline)) {
          const recovered = await recoverCompletedTurn(conversationId, content, sentAtMs)
          if (recovered) {
            setMessages([...next, { role: 'assistant', content: recovered }])
            return
          }
        }

        const failure = `${c(COPY.error, l)} [${String(err?.name || '')}] ${String(err?.message || '')}`.trim()
        setMessages([...next, { role: 'assistant', content: aborted ? (hitDeadline ? c(COPY.timedOut, l) : c(COPY.stopped, l)) : failure }])
      } finally {
        clearTimeout(deadline)
        abortRef.current = null
      }
    } catch {
      setMessages([...next, { role: 'assistant', content: c(COPY.error, l) }])
    } finally {
      setLoading(false)
    }
  }

  async function submitFeedback(messageIndex: number, assistantContent: string, feedbackType: FeedbackKind, correctionText?: string) {
    const conversationId = conversationIdRef.current
    if (!conversationId || !assistantContent.trim()) return
    const current = feedbackByMessage[messageIndex]
    if (current?.status === 'saving') return
    setFeedbackByMessage(prev => ({ ...prev, [messageIndex]: { ...prev[messageIndex], status: 'saving', kind: feedbackType } }))
    try {
      const response = await fetch('/api/assistant/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, assistantContent, feedbackType, correctionText }),
      })
      if (!response.ok) throw new Error(`feedback_http_${response.status}`)
      setFeedbackByMessage(prev => ({ ...prev, [messageIndex]: { status: 'saved', kind: feedbackType, correctionOpen: false, correction: '' } }))
    } catch {
      setFeedbackByMessage(prev => ({ ...prev, [messageIndex]: { ...prev[messageIndex], status: 'error', kind: feedbackType } }))
    }
  }

  function stopRequest() {
    abortRef.current?.abort()
  }

  // ── History helpers ─────────────────────────────────────────────────────────
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
    setStagedFiles([])
    setFileError('')
    setHistoryOpen(false)
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(DATE_LOCALES[l], { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const canSend = !loading && (input.trim().length > 0 || stagedFiles.length > 0)

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 165px)', minHeight: 480, maxWidth: 1280, margin: '0 auto', padding: '24px 28px', width: '100%', boxSizing: 'border-box', color: 'var(--text-primary)' }}
    >
      {/* ── Drag-over overlay ── */}
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, borderRadius: 24, background: 'rgba(3,7,18,.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '2px dashed rgba(26,240,255,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>📎</div>
            <p style={{ color: 'rgba(26,240,255,.9)', fontSize: 16, fontWeight: 700, marginTop: 10 }}>{c(COPY.dropHere, l)}</p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.16), transparent 22rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 24, padding: '20px 24px', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p className="sb-eyebrow">✨ {c(COPY.eyebrow, l)}</p>
            <h1 style={{ fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '6px 0 6px' }}>{c(COPY.title, l)}</h1>
            <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{c(COPY.subtitle, l)}</p>
            {cosStatus && (() => {
              const m = cosStatus.mode
              const ok = m === 'cos'
              const accent = ok ? '#22c55e' : m === 'degraded' ? '#fca5a5' : '#fdba74'
              const bg = ok ? 'rgba(34,197,94,.14)' : m === 'degraded' ? 'rgba(239,68,68,.16)' : 'rgba(251,146,60,.16)'
              const label = ok ? '🧠 COS ACTIVE — owner' : m === 'degraded' ? '⚠️ COS DEGRADED — AI key missing' : '⚠️ CONCIERGE MODE — not recognized as owner'
              return (
                <div style={{ marginTop: 10 }}>
                  <span title={cosStatus.detail} style={{ display: 'inline-flex', alignItems: 'center', padding: '5px 12px', borderRadius: 999, background: bg, border: `1px solid ${accent}`, color: accent, fontSize: 12, fontWeight: 900, letterSpacing: '.02em' }}>{label}</span>
                  {!ok && <p style={{ color: accent, fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.5, maxWidth: 620 }}>{cosStatus.detail}</p>}
                </div>
              )
            })()}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => (historyOpen ? setHistoryOpen(false) : openHistory())} className="sb-button-secondary" style={{ fontSize: 12, padding: '9px 14px', whiteSpace: 'nowrap' }}>🕘 {c(COPY.history, l)}</button>
            <button onClick={startNewChat} className="sb-button-secondary" style={{ fontSize: 12, padding: '9px 14px', whiteSpace: 'nowrap' }}>＋ {c(COPY.newChat, l)}</button>
          </div>
        </div>
      </div>

      {/* ── Thread ── */}
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
                {msg.role === 'assistant' ? (
                  <>
                    <VideoJsonMessage content={msg.content} />
                    {(() => {
                      const feedback = feedbackByMessage[i] || { status: 'idle' as const }
                      const busy = feedback.status === 'saving'
                      const correction = feedback.correction || ''
                      return (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button type="button" disabled={busy || feedback.status === 'saved'} onClick={() => submitFeedback(i, msg.content, 'positive')} style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid rgba(34,197,94,.32)', background: 'rgba(34,197,94,.08)', color: '#86efac', cursor: busy ? 'wait' : 'pointer', fontSize: 11.5 }}>👍 {uiText('assistantFeedback.helpful')}</button>
                            <button type="button" disabled={busy || feedback.status === 'saved'} onClick={() => submitFeedback(i, msg.content, 'negative')} style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid rgba(248,113,113,.32)', background: 'rgba(248,113,113,.08)', color: '#fca5a5', cursor: busy ? 'wait' : 'pointer', fontSize: 11.5 }}>👎 {uiText('assistantFeedback.notHelpful')}</button>
                            <button type="button" disabled={busy || feedback.status === 'saved'} onClick={() => setFeedbackByMessage(prev => ({ ...prev, [i]: { ...(prev[i] || { status: 'idle' }), correctionOpen: true, correction: prev[i]?.correction || '' } }))} style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid rgba(26,240,255,.28)', background: 'rgba(26,240,255,.06)', color: '#67e8f9', cursor: busy ? 'wait' : 'pointer', fontSize: 11.5 }}>✎ {uiText('assistantFeedback.correctThis')}</button>
                            {feedback.status === 'saved' && <span style={{ color: '#86efac', fontSize: 11.5 }}>{uiText('assistantFeedback.feedbackSaved')}</span>}
                            {feedback.status === 'error' && <span style={{ color: '#fca5a5', fontSize: 11.5 }}>{uiText('assistantFeedback.feedbackError')}</span>}
                          </div>
                          {feedback.correctionOpen && feedback.status !== 'saved' && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                              <textarea value={correction} onChange={e => setFeedbackByMessage(prev => ({ ...prev, [i]: { ...(prev[i] || { status: 'idle' }), correctionOpen: true, correction: e.target.value } }))} placeholder={uiText('assistantFeedback.correctionPlaceholder')} rows={3} maxLength={4000} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(3,7,18,.55)', color: '#fff', padding: '9px 10px', fontSize: 12, resize: 'vertical' }} />
                              <div style={{ display: 'flex', gap: 7 }}>
                                <button type="button" disabled={busy || !correction.trim()} onClick={() => submitFeedback(i, msg.content, 'correction', correction)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(26,240,255,.4)', background: 'rgba(26,240,255,.12)', color: '#67e8f9', cursor: busy ? 'wait' : 'pointer', fontSize: 11.5, fontWeight: 700 }}>{uiText('assistantFeedback.submitCorrection')}</button>
                                <button type="button" disabled={busy} onClick={() => setFeedbackByMessage(prev => ({ ...prev, [i]: { ...(prev[i] || { status: 'idle' }), correctionOpen: false } }))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: 'rgba(255,255,255,.65)', cursor: 'pointer', fontSize: 11.5 }}>{uiText('assistantFeedback.cancelCorrection')}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </>
                ) : msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '12px 16px', borderRadius: 16, borderTopLeftRadius: 4, background: 'rgba(26,240,255,.07)', border: '1px solid rgba(26,240,255,.2)', color: 'rgba(255,255,255,.5)', fontSize: 14 }}>
                {c(COPY.thinking, l)}
              </div>
              <button
                type="button"
                onClick={stopRequest}
                style={{ marginLeft: 10, alignSelf: 'center', padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: 'rgba(255,255,255,.7)', fontSize: 13, cursor: 'pointer' }}
              >
                {c(COPY.stop, l)}
              </button>
            </div>
          )}
        </div>

        {/* ── History drawer ── */}
        {historyOpen && (
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(320px, 88%)', zIndex: 5, background: 'linear-gradient(160deg, rgba(10,16,32,.97), rgba(3,7,18,.97))', border: '1px solid rgba(26,240,255,.25)', borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 18px 50px rgba(0,0,0,.55)', overflow: 'hidden' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'linear-gradient(160deg, rgba(10,16,32,.99), rgba(3,7,18,.99))', padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.07)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.02em', color: 'rgba(26,240,255,.9)' }}>🕘 {c(COPY.history, l)}</span>
              <button onClick={() => setHistoryOpen(false)} className="sb-button-secondary" style={{ fontSize: 11, padding: '6px 10px' }}>{c(COPY.close, l)}</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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

      {/* ── Input area ── */}
      <div style={{ marginTop: 12, flexShrink: 0 }}>

        {/* File error banner */}
        {fileError && (
          <div style={{ marginBottom: 8, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,80,80,.12)', border: '1px solid rgba(255,80,80,.35)', color: 'rgba(255,180,180,.9)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>⚠️ {fileError}</span>
            <button onClick={() => setFileError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,180,180,.7)', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        )}

        {/* Staged file preview chips */}
        {stagedFiles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, maxHeight: 120, overflowY: 'auto', padding: '2px 0' }}>
            {stagedFiles.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(26,240,255,.08)', border: '1px solid rgba(26,240,255,.25)', borderRadius: 10, padding: '5px 10px 5px 6px', maxWidth: 200, minWidth: 0 }}>
                {f.isImage ? (
                  <img src={f.dataUrl} alt={f.name} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)' }}>{formatBytes(f.size)}</div>
                </div>
                <button onClick={() => removeFile(f.id)} title={uiText('generatedUi.u_c3812fc4acb861d5')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.5)', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Text input row */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>

          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_MIME.join(',')}
            onChange={onFileInputChange}
            style={{ display: 'none' }}
            aria-hidden="true"
          />

          {/* Paperclip button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title={uiText('generatedUi.u_e697cc1e45afa541')}
            aria-label={uiText('generatedUi.u_e697cc1e45afa541')}
            style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 12, background: stagedFiles.length > 0 ? 'rgba(26,240,255,.15)' : 'rgba(255,255,255,.06)', border: `1px solid ${stagedFiles.length > 0 ? 'rgba(26,240,255,.45)' : 'rgba(255,255,255,.15)'}`, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: loading ? 0.5 : 1, transition: 'background .15s, border-color .15s', color: stagedFiles.length > 0 ? '#1af0ff' : 'rgba(255,255,255,.7)' }}
          >
            📎
          </button>

          {/* Text input */}
          <textarea
            className="sb-input"
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder={c(COPY.placeholder, l)}
            rows={1}
            style={{ flex: 1, padding: '13px 16px', borderRadius: 14, fontSize: 14, resize: 'none', lineHeight: 1.4, maxHeight: 200, overflowY: 'auto', fontFamily: 'inherit' }}
            disabled={loading}
          />

          {/* Send button */}
          <button
            onClick={() => send(input)}
            disabled={!canSend}
            className="sb-button-primary"
            style={{ padding: '0 24px', height: 42, borderRadius: 14, opacity: canSend ? 1 : 0.6, cursor: loading ? 'wait' : 'pointer', flexShrink: 0 }}
          >
            {c(COPY.send, l)}
          </button>
        </div>
      </div>
    </div>
  )
}
