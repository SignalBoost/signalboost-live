// saas/app/page.tsx
'use client'

import Link from 'next/link'
import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import AssistantMessage from '@/components/AssistantMessage'
import { PreviewProjects } from '@/components/home/PreviewProjects'
import { t } from '@/lib/i18n/t'
import { getConciergeTranscriptCopy } from '@/lib/i18n/conciergeTranscriptCopy'
import {
  formatConciergeTranscript,
  transcriptMessages,
  type ConciergeTranscriptTurn,
} from '@/lib/homepageConciergeTranscript'
import { listPublicPortableProducts } from '@/lib/portable-products'

type Attachment = {
  id: string
  name: string
  type: string
  dataUrl: string
  isImage: boolean
}

const ATTACH_MAX_BYTES = 10 * 1024 * 1024
const ATTACH_MAX_FILES = 5
const ATTACH_ALLOWED_RE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/(plain|csv|markdown))$/i
const ATTACH_INPUT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,.txt,.md,.csv'

export default function Home() {
  const { dict, lang } = useI18n()
  const c = (key: string) => t(dict, `homepage.concierge.${key}`)
  const transcriptCopy = getConciergeTranscriptCopy(lang)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<ConciergeTranscriptTurn[]>([])
  const [pendingRequest, setPendingRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copiedTarget, setCopiedTarget] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef('')
  const chips = ['grow', 'review', 'campaign', 'show']

  useEffect(() => {
    if (!turns.length && !pendingRequest) return
    const thread = threadRef.current
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' })
  }, [turns, pendingRequest, loading])

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('read_failed'))
      reader.readAsDataURL(file)
    })
  }

  async function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return
    const staged: Attachment[] = []
    for (const file of Array.from(fileList)) {
      const allowed = ATTACH_ALLOWED_RE.test(file.type) || /\.(txt|md|csv)$/i.test(file.name)
      if (!allowed || file.size > ATTACH_MAX_BYTES) continue
      try {
        const dataUrl = await readFileAsDataUrl(file)
        staged.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          dataUrl,
          isImage: /^image\//.test(file.type),
        })
      } catch {
        // Skip unreadable files. The visible staged-file list remains authoritative.
      }
    }
    if (staged.length) setAttachments((current) => [...current, ...staged].slice(0, ATTACH_MAX_FILES))
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id))
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragOver(false)
    void addFiles(event.dataTransfer.files)
  }

  async function copyText(value: string, target: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedTarget(target)
      window.setTimeout(() => setCopiedTarget((current) => current === target ? '' : current), 1800)
    } catch {
      // Clipboard permission may be blocked; all conversation text remains selectable.
    }
  }

  function startNewChat() {
    conversationIdRef.current = ''
    setTurns([])
    setPendingRequest('')
    setQuestion('')
    setAttachments([])
    setFailed(false)
    setCopiedTarget('')
  }

  async function ask(event?: FormEvent) {
    event?.preventDefault()
    const prompt = question.trim()
    const staged = attachments
    if ((!prompt && staged.length === 0) || loading) return
    const displayContent = [
      prompt,
      staged.length ? `📎 ${staged.map((attachment) => attachment.name).join(', ')}` : '',
    ].filter(Boolean).join('\n\n')

    if (!conversationIdRef.current) conversationIdRef.current = crypto.randomUUID()
    setLoading(true)
    setFailed(false)
    setPendingRequest(displayContent)

    try {
      const response = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: transcriptMessages(turns, displayContent),
          attachments: staged.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
          context: {
            language: lang,
            currentPage: '/',
            conversationId: conversationIdRef.current,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      })
      const payload = await response.json().catch(() => null)
      const reply = String(payload?.reply || payload?.error || '').trim()
      if (!reply) throw new Error('concierge_unavailable')
      setTurns((current) => [...current, { request: displayContent, response: reply }])
      setPendingRequest('')
      setQuestion('')
      setAttachments([])
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const fullTranscript = formatConciergeTranscript(turns, {
    request: c('yourRequest'),
    response: c('cosLabel'),
  })

  return (
    <section
      className={'concierge-shell' + (dragOver ? ' is-dragging' : '')}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOver(false) }}
      onDrop={onDrop}
    >
      {dragOver ? (
        <div className="drop-overlay" aria-live="polite">
          <div className="drop-icon">📎</div>
          <strong>{t(dict, 'concierge.dropHere')}</strong>
          <span>{t(dict, 'concierge.dropHint')}</span>
        </div>
      ) : null}

      <header className="assistant-header">
        <div className="header-copy">
          <p className="eyebrow">✦ {c('eyebrow')}</p>
          <h1>{transcriptCopy.chatTitle}</h1>
          <p className="subtitle">{transcriptCopy.chatSubtitle}</p>
          <span className="public-badge">✦ {c('eyebrow')}</span>
        </div>
        <div className="header-actions">
          <Link className="secondary-button" href="/dashboard/assistant">↗ {transcriptCopy.openFullAssistant}</Link>
          <button type="button" className="secondary-button" onClick={startNewChat}>＋ {transcriptCopy.newChat}</button>
        </div>
      </header>

      <main className="thread-wrap">
        <div ref={threadRef} className="thread" aria-live="polite" aria-busy={loading}>
          {!turns.length && !pendingRequest && !loading ? (
            <div className="empty-state">
              <div className="empty-icon">✦</div>
              <p>{transcriptCopy.empty}</p>
              <div className="suggestions" aria-label={c('suggested')}>
                {chips.map((key) => (
                  <button key={key} type="button" className="secondary-button" onClick={() => setQuestion(c(key))}>{c(key)}</button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn, index) => (
            <div className="exchange" key={`${index}-${turn.request.slice(0, 32)}`}>
              <div className="message-row user-row">
                <article className="message user-message">
                  <div className="message-tools">
                    <span>{c('yourRequest')}</span>
                    <button type="button" onClick={() => void copyText(turn.request, `q-${index}`)}>
                      ⧉ {copiedTarget === `q-${index}` ? transcriptCopy.copied : transcriptCopy.copyQuestion}
                    </button>
                  </div>
                  <p>{turn.request}</p>
                </article>
              </div>

              <div className="message-row assistant-row">
                <article className="message assistant-message">
                  <div className="message-tools assistant-tools">
                    <span>{c('cosLabel')}</span>
                    <button type="button" onClick={() => void copyText(turn.response, `a-${index}`)}>
                      ⧉ {copiedTarget === `a-${index}` ? transcriptCopy.copied : transcriptCopy.copyResponse}
                    </button>
                  </div>
                  <div className="assistant-content"><AssistantMessage content={turn.response} /></div>
                </article>
              </div>
            </div>
          ))}

          {pendingRequest ? (
            <div className="exchange pending-exchange">
              <div className="message-row user-row">
                <article className="message user-message">
                  <div className="message-tools"><span>{c('yourRequest')}</span></div>
                  <p>{pendingRequest}</p>
                </article>
              </div>
              <div className="message-row assistant-row">
                <article className={'message assistant-message' + (failed ? ' failed-message' : '')}>
                  <div className="message-tools assistant-tools"><span>{c('cosLabel')}</span></div>
                  {loading ? <p className="thinking">{c('thinking')}</p> : null}
                  {failed ? <p className="error" role="status">{c('error')}</p> : null}
                </article>
              </div>
            </div>
          ) : null}
        </div>

        {turns.length ? (
          <div className="thread-actions">
            <button type="button" className="secondary-button copy-full" onClick={() => void copyText(fullTranscript, 'full')}>
              ⧉ {copiedTarget === 'full' ? transcriptCopy.copied : transcriptCopy.copyFull}
            </button>
          </div>
        ) : null}
      </main>

      <div className="composer-area">
        {attachments.length ? (
          <div className="attachments" aria-label={t(dict, 'concierge.attach')}>
            {attachments.map((attachment) => (
              <div className="attachment" key={attachment.id}>
                {attachment.isImage ? <img src={attachment.dataUrl} alt={attachment.name} /> : <span aria-hidden="true">📄</span>}
                <span className="attachment-name">{attachment.name}</span>
                <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={t(dict, 'concierge.removeFile')}>×</button>
              </div>
            ))}
          </div>
        ) : null}

        <form className="composer" onSubmit={ask}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACH_INPUT_ACCEPT}
            onChange={(event) => { void addFiles(event.target.files); event.target.value = '' }}
            className="file-input"
          />
          <button
            type="button"
            className="attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || attachments.length >= ATTACH_MAX_FILES}
            aria-label={t(dict, 'concierge.attach')}
            title={t(dict, 'concierge.attach')}
          >📎</button>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void ask()
              }
            }}
            rows={2}
            maxLength={8000}
            placeholder={c('placeholder')}
            aria-label={c('placeholder')}
          />
          <button type="submit" className="send-button" disabled={(!question.trim() && attachments.length === 0) || loading}>
            {loading ? c('thinking') : c('send')} <span aria-hidden="true">→</span>
          </button>
        </form>
        <p className="composer-hint">📎 {t(dict, 'concierge.dropHint')}</p>
      </div>

      <div hidden aria-hidden="true">{listPublicPortableProducts().map((product) => <span key={product.manifest.productId}>{product.manifest.productId}</span>)}</div>
      <div hidden aria-hidden="true"><PreviewProjects /></div>

      <style jsx>{`
        .concierge-shell{position:relative;display:flex;flex-direction:column;min-height:calc(100svh - 165px);max-width:1280px;margin:0 auto;padding:24px 28px 36px;box-sizing:border-box;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .assistant-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-shrink:0;padding:20px 24px;margin-bottom:16px;border:1px solid rgba(26,240,255,.18);border-radius:24px;background:radial-gradient(circle at 20% 10%,rgba(26,240,255,.16),transparent 22rem),linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.02))}
        .header-copy{min-width:0}.eyebrow{margin:0;color:#ffc300;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.assistant-header h1{margin:6px 0;font-size:clamp(20px,3.5vw,30px);font-weight:900;letter-spacing:-.04em;line-height:1.1}.subtitle{max-width:760px;margin:0;color:rgba(255,255,255,.55);font-size:13px;line-height:1.6}.public-badge{display:inline-flex;align-items:center;margin-top:10px;padding:5px 12px;border:1px solid rgba(26,240,255,.45);border-radius:999px;background:rgba(26,240,255,.09);color:#67e8f9;font-size:11px;font-weight:900;letter-spacing:.02em}.header-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0}
        .secondary-button{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(26,240,255,.34);border-radius:999px;padding:9px 14px;background:rgba(26,240,255,.06);color:#dffcff;text-decoration:none;font:inherit;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}.secondary-button:hover{border-color:#67e8f9;background:rgba(26,240,255,.12);color:#fff}
        .thread-wrap{position:relative;display:flex;flex-direction:column;flex:1;min-height:0}.thread{flex:1;min-height:460px;max-height:min(68vh,820px);overflow-y:auto;padding:18px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:linear-gradient(145deg,rgba(15,23,42,.78),rgba(3,7,18,.68));display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth}.empty-state{margin:auto;text-align:center;max-width:620px;padding:36px 20px}.empty-icon{font-size:42px;color:#67e8f9}.empty-state p{margin:10px auto 0;color:rgba(255,255,255,.6);font-size:14px;line-height:1.65}.suggestions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px}.exchange{display:grid;gap:12px}.exchange+.exchange{padding-top:2px}.message-row{display:flex}.user-row{justify-content:flex-end}.assistant-row{justify-content:flex-start}.message{box-sizing:border-box;padding:12px 16px;border-radius:16px;color:#fff;font-size:14px;line-height:1.7;overflow-wrap:anywhere}.user-message{max-width:80%;border-top-right-radius:4px;background:rgba(255,195,0,.12);border:1px solid rgba(255,195,0,.28)}.assistant-message{width:100%;border-top-left-radius:4px;background:rgba(26,240,255,.07);border:1px solid rgba(26,240,255,.2)}.failed-message{border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.07)}.message p{margin:8px 0 0;white-space:pre-wrap}.message-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#f6c453;font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.assistant-tools{color:#67e8f9}.message-tools button{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 9px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.68);font:inherit;font-size:10px;font-weight:800;letter-spacing:0;text-transform:none;cursor:pointer}.message-tools button:hover{color:#fff;border-color:rgba(255,255,255,.28)}.assistant-content{margin-top:8px;white-space:normal}.thinking{color:rgba(255,255,255,.55)}.error{color:#fca5a5}.thread-actions{display:flex;justify-content:flex-end;margin-top:10px}.copy-full{border-color:rgba(255,195,0,.38);color:#ffe08a;background:rgba(255,195,0,.07)}
        .composer-area{margin-top:12px;flex-shrink:0}.attachments{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;max-height:120px;overflow-y:auto}.attachment{display:flex;align-items:center;gap:7px;max-width:230px;padding:5px 8px 5px 6px;border:1px solid rgba(26,240,255,.25);border-radius:10px;background:rgba(26,240,255,.08);color:#fff;font-size:11px}.attachment img,.attachment>span:first-child{width:28px;height:28px;border-radius:6px;object-fit:cover;flex-shrink:0}.attachment-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attachment button{border:0;background:transparent;color:rgba(255,255,255,.55);cursor:pointer;font-size:16px}.composer{display:flex;gap:10px;align-items:flex-end;padding:8px;border:1px solid rgba(26,240,255,.28);border-radius:18px;background:rgba(3,7,18,.78);box-shadow:0 0 0 4px rgba(26,240,255,.025)}.file-input{display:none}.composer textarea{min-width:0;flex:1;resize:none;border:0;background:transparent;color:#fff;padding:11px 4px;font:inherit;font-size:14px;line-height:1.5;outline:0}.composer textarea::placeholder{color:rgba(255,255,255,.36)}.attach-button,.send-button{height:44px;border-radius:12px;font:inherit;font-weight:850;cursor:pointer}.attach-button{width:46px;flex:0 0 46px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;font-size:17px}.send-button{border:0;padding:0 18px;background:linear-gradient(135deg,#ffc300,#d9952c);color:#171006;white-space:nowrap}.attach-button:disabled,.send-button:disabled{opacity:.5;cursor:not-allowed}.composer-hint{margin:7px 4px 0;color:rgba(255,255,255,.38);font-size:11px}
        .drop-overlay{position:absolute;inset:16px;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;border:2px dashed rgba(26,240,255,.7);border-radius:24px;background:rgba(3,7,18,.92);backdrop-filter:blur(8px);text-align:center}.drop-overlay strong{color:#67e8f9}.drop-overlay span{color:rgba(255,255,255,.55);font-size:12px}.drop-icon{font-size:40px}
        @media(max-width:760px){.concierge-shell{padding:18px 12px 28px}.assistant-header{flex-direction:column;padding:18px}.header-actions{width:100%;justify-content:flex-start}.thread{min-height:420px;padding:12px}.user-message{max-width:94%}.message{padding:11px 12px}.message-tools{align-items:flex-start;flex-direction:column}.composer{gap:7px}.send-button{padding:0 12px}.secondary-button{white-space:normal}}
      `}</style>
    </section>
  )
}
