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
import {
  conciergePromptWithScenarioRule,
  looksLikePrivateDataRefusal,
  shouldClarifyUserSuppliedScenario,
} from '@/lib/homepageConciergePolicy'
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
  const copy = getConciergeTranscriptCopy(lang)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<ConciergeTranscriptTurn[]>([])
  const [pendingRequest, setPendingRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copiedTarget, setCopiedTarget] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [salutation, setSalutation] = useState(copy.welcomeHello)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef('')
  const chips = ['grow', 'review', 'campaign', 'show']
  const showWelcome = turns.length === 0 && !pendingRequest && !loading

  useEffect(() => {
    const hour = new Date().getHours()
    setSalutation(hour < 12 ? copy.welcomeMorning : hour < 18 ? copy.welcomeAfternoon : copy.welcomeEvening)
  }, [copy.welcomeMorning, copy.welcomeAfternoon, copy.welcomeEvening])

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

    const send = async (transportPrompt: string) => {
      const response = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: transcriptMessages(turns, transportPrompt),
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
      return reply
    }

    try {
      const isScenario = shouldClarifyUserSuppliedScenario(displayContent)
      const transportPrompt = isScenario ? conciergePromptWithScenarioRule(displayContent) : displayContent
      let reply = await send(transportPrompt)

      // Defensive recovery for older/novel refusal wording: if a public answer still treats facts
      // supplied by the user as inaccessible private records, retry once with the explicit premise
      // boundary. This does not grant any private-system access; it only clarifies the origin of the
      // text already present in the current request.
      if (!isScenario && looksLikePrivateDataRefusal(reply)) {
        reply = await send(conciergePromptWithScenarioRule(displayContent))
      }

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
      <div className="aurora" aria-hidden="true" />

      {dragOver ? (
        <div className="drop-overlay" aria-live="polite">
          <div className="drop-icon">📎</div>
          <strong>{t(dict, 'concierge.dropHere')}</strong>
          <span>{t(dict, 'concierge.dropHint')}</span>
        </div>
      ) : null}

      {showWelcome ? (
        <header className="welcome-card">
          <div className="welcome-copy">
            <p className="eyebrow">✦ {c('eyebrow')}</p>
            <h1>{salutation}<br /><span>{copy.welcomeQuestion}</span></h1>
            <p className="welcome-lead">{copy.chatSubtitle}</p>
            <div className="welcome-actions">
              <Link className="primary-link" href="/home">▦ {copy.platformHome} <span aria-hidden="true">→</span></Link>
              <Link className="secondary-button" href="/dashboard/assistant">↗ {copy.openFullAssistant}</Link>
            </div>
          </div>
          <div className="welcome-mark" aria-hidden="true">✦</div>
        </header>
      ) : (
        <header className="assistant-header">
          <div className="header-copy">
            <p className="eyebrow">✦ {c('eyebrow')}</p>
            <h1>{copy.chatTitle}</h1>
            <p className="subtitle">{copy.chatSubtitle}</p>
          </div>
          <div className="header-actions">
            <Link className="secondary-button" href="/home">▦ {copy.platformHome}</Link>
            <Link className="secondary-button" href="/dashboard/assistant">↗ {copy.openFullAssistant}</Link>
            <button type="button" className="secondary-button" onClick={startNewChat}>＋ {copy.newChat}</button>
          </div>
        </header>
      )}

      {!showWelcome ? (
        <main className="thread-wrap">
          <div ref={threadRef} className="thread" aria-live="polite" aria-busy={loading}>
            {turns.map((turn, index) => (
              <div className="exchange" key={`${index}-${turn.request.slice(0, 32)}`}>
                <div className="message-row user-row">
                  <article className="message user-message">
                    <div className="message-tools">
                      <span>{c('yourRequest')}</span>
                      <button type="button" onClick={() => void copyText(turn.request, `q-${index}`)}>
                        ⧉ {copiedTarget === `q-${index}` ? copy.copied : copy.copyQuestion}
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
                        ⧉ {copiedTarget === `a-${index}` ? copy.copied : copy.copyResponse}
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
                ⧉ {copiedTarget === 'full' ? copy.copied : copy.copyFull}
              </button>
            </div>
          ) : null}
        </main>
      ) : null}

      <div className={'composer-area' + (showWelcome ? ' welcome-composer' : '')}>
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

        {showWelcome ? (
          <div className="suggestions" aria-label={c('suggested')}>
            {chips.map((key) => (
              <button key={key} type="button" className="secondary-button" onClick={() => setQuestion(c(key))}>{c(key)}</button>
            ))}
          </div>
        ) : null}
      </div>

      <div hidden aria-hidden="true">{listPublicPortableProducts().map((product) => <span key={product.manifest.productId}>{product.manifest.productId}</span>)}</div>
      <div hidden aria-hidden="true"><PreviewProjects /></div>

      <style jsx>{`
        .concierge-shell{position:relative;isolation:isolate;display:flex;flex-direction:column;min-height:calc(100svh - 165px);max-width:1280px;margin:0 auto;padding:24px 28px 38px;box-sizing:border-box;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
        .aurora{position:absolute;inset:-30%;z-index:-1;pointer-events:none;background:radial-gradient(circle at 15% 12%,rgba(31,203,227,.13),transparent 28%),radial-gradient(circle at 75% 20%,rgba(255,195,0,.12),transparent 28%),radial-gradient(circle at 55% 92%,rgba(85,76,255,.14),transparent 34%);filter:blur(24px)}
        .welcome-card{position:relative;display:flex;justify-content:space-between;gap:24px;min-height:310px;padding:clamp(30px,5vw,64px);border:1px solid rgba(255,255,255,.14);border-radius:30px;background:linear-gradient(145deg,rgba(17,24,39,.9),rgba(4,8,19,.78));box-shadow:0 28px 90px rgba(0,0,0,.34);overflow:hidden}
        .welcome-copy{position:relative;z-index:1;max-width:900px}.eyebrow{margin:0;color:#ffc300;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.welcome-card h1{margin:20px 0 16px;font-size:clamp(38px,6vw,72px);line-height:1;letter-spacing:-.055em}.welcome-card h1 span{background:linear-gradient(105deg,#fff,#f6c453 62%,#7ee8ef);-webkit-background-clip:text;background-clip:text;color:transparent}.welcome-lead{max-width:760px;margin:0;color:rgba(255,255,255,.65);font-size:clamp(15px,2vw,18px);line-height:1.65}.welcome-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.primary-link{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 17px;border-radius:999px;background:linear-gradient(135deg,#f7ca5c,#d9952c);color:#151008;text-decoration:none;font-size:13px;font-weight:900}.welcome-mark{align-self:center;display:grid;place-items:center;width:170px;height:170px;border:1px solid rgba(103,232,249,.2);border-radius:50%;background:radial-gradient(circle,rgba(103,232,249,.14),rgba(255,195,0,.05) 48%,transparent 70%);color:#f6c453;font-size:54px;box-shadow:0 0 80px rgba(26,240,255,.12)}
        .assistant-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-shrink:0;padding:20px 24px;margin-bottom:16px;border:1px solid rgba(26,240,255,.18);border-radius:24px;background:radial-gradient(circle at 20% 10%,rgba(26,240,255,.16),transparent 22rem),linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.02))}.header-copy{min-width:0}.assistant-header h1{margin:6px 0;font-size:clamp(20px,3.5vw,30px);font-weight:900;letter-spacing:-.04em;line-height:1.1}.subtitle{max-width:760px;margin:0;color:rgba(255,255,255,.55);font-size:13px;line-height:1.6}.header-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0}
        .secondary-button{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(26,240,255,.34);border-radius:999px;padding:9px 14px;background:rgba(26,240,255,.06);color:#dffcff;text-decoration:none;font:inherit;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}.secondary-button:hover{border-color:#67e8f9;background:rgba(26,240,255,.12);color:#fff}
        .thread-wrap{position:relative;display:flex;flex-direction:column;flex:1;min-height:0}.thread{flex:1;min-height:460px;max-height:min(68vh,820px);overflow-y:auto;padding:18px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:linear-gradient(145deg,rgba(15,23,42,.78),rgba(3,7,18,.68));display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth}.exchange{display:flex;flex-direction:column;gap:12px}.message-row{display:flex;width:100%}.user-row{justify-content:flex-end}.assistant-row{justify-content:flex-start}.message{width:min(88%,950px);border-radius:18px;padding:14px 16px;box-sizing:border-box}.user-message{background:linear-gradient(145deg,rgba(91,71,17,.43),rgba(38,31,12,.7));border:1px solid rgba(255,195,0,.45)}.assistant-message{background:linear-gradient(145deg,rgba(8,53,65,.63),rgba(6,29,42,.86));border:1px solid rgba(26,240,255,.35)}.message p{margin:8px 0 0;white-space:pre-wrap;line-height:1.65;font-size:14px}.message-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;color:#ffc300;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.assistant-tools{color:#67e8f9}.message-tools button{border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:6px 9px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);font-size:10px;font-weight:800;cursor:pointer;text-transform:none;letter-spacing:0}.assistant-content{margin-top:8px;line-height:1.65;font-size:14px}.thinking{color:#67e8f9}.error{color:#fca5a5}.thread-actions{display:flex;justify-content:flex-end;padding:10px 0 0}.copy-full{border-color:rgba(255,195,0,.55);color:#ffe07a;background:rgba(255,195,0,.06)}
        .composer-area{flex-shrink:0;margin-top:14px}.welcome-composer{margin-top:18px}.composer{display:flex;align-items:stretch;gap:8px;padding:8px;border:1px solid rgba(26,240,255,.38);border-radius:20px;background:rgba(2,8,23,.86);box-shadow:0 0 0 5px rgba(26,240,255,.025)}.file-input{display:none}.attach-button{width:46px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:rgba(255,255,255,.06);color:#fff;font-size:16px;cursor:pointer}.composer textarea{min-width:0;flex:1;resize:none;border:0;background:transparent;color:#fff;padding:12px 6px;font:inherit;line-height:1.45;outline:0}.composer textarea::placeholder{color:#74829c}.send-button{min-width:120px;border:0;border-radius:13px;padding:0 18px;background:linear-gradient(135deg,#f7ca5c,#d9952c);color:#151008;font-weight:900;cursor:pointer}.composer button:disabled{opacity:.55;cursor:not-allowed}.composer-hint{margin:7px 8px 0;color:rgba(255,255,255,.38);font-size:10px}.suggestions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:15px}.attachments{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}.attachment{display:flex;align-items:center;gap:7px;max-width:320px;padding:7px 9px;border:1px solid rgba(255,255,255,.13);border-radius:12px;background:rgba(255,255,255,.05);font-size:11px}.attachment img{width:28px;height:28px;border-radius:6px;object-fit:cover}.attachment-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attachment button{border:0;background:transparent;color:#fff;cursor:pointer}.drop-overlay{position:absolute;z-index:20;inset:16px;display:grid;place-items:center;align-content:center;gap:6px;border:2px dashed #67e8f9;border-radius:24px;background:rgba(3,7,18,.94);color:#fff;text-align:center}.drop-icon{font-size:30px}
        @media(max-width:760px){.concierge-shell{padding:14px 12px 28px}.welcome-card{min-height:0;padding:30px 22px}.welcome-mark{display:none}.assistant-header{padding:17px;flex-direction:column}.header-actions{justify-content:flex-start}.thread{min-height:420px;padding:11px}.message{width:96%}.composer{gap:5px}.send-button{min-width:86px;padding:0 10px}.welcome-card h1{font-size:42px}}
      `}</style>
    </section>
  )
}
