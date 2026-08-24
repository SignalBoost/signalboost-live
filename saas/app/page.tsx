'use client'

import Link from 'next/link'
import { DragEvent, FormEvent, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import AssistantMessage from '@/components/AssistantMessage'
import { PreviewProjects } from '@/components/home/PreviewProjects'
import { t } from '@/lib/i18n/t'
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
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [handoffConversationId, setHandoffConversationId] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chips = ['grow', 'review', 'campaign', 'show']

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
      } catch { /* skip unreadable files */ }
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

  async function ask(event?: FormEvent) {
    event?.preventDefault()
    const prompt = question.trim()
    const staged = attachments
    if ((!prompt && staged.length === 0) || loading) return
    const displayContent = [prompt, staged.length ? `📎 ${staged.map((attachment) => attachment.name).join(', ')}` : ''].filter(Boolean).join('\n\n')
    const conversationId = crypto.randomUUID()
    setLoading(true)
    setAnswer('')
    setFailed(false)
    setHandoffConversationId(conversationId)
    try {
      const response = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: displayContent }],
          attachments: staged.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
          context: { language: lang, currentPage: '/', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, conversationId },
        }),
      })
      const payload = await response.json().catch(() => null)
      const reply = String(payload?.reply || payload?.error || '').trim()
      if (!reply) throw new Error('concierge_unavailable')
      // A governed 4xx/5xx response may still contain a useful COS explanation.
      // Render that response instead of hiding it behind the generic unavailable line.
      setAnswer(reply)
      setQuestion('')
      setAttachments([])
    } catch {
      setFailed(true)
      setHandoffConversationId('')
    } finally {
      setLoading(false)
    }
  }

  return <section
    className={'concierge-home' + (dragOver ? ' is-dragging' : '')}
    onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
    onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOver(false) }}
    onDrop={onDrop}
  >
    <div className="aurora" aria-hidden="true" />
    <section className="concierge-panel" aria-label={c('eyebrow')}>
      <div className="identity"><span className="orb" aria-hidden="true">✦</span><span>{c('eyebrow')}</span></div>
      <h1>{c('greeting')}<br /><em>{c('headline')}</em></h1>
      <p className="lead">{c('subhead')}</p>
      <Link href="/home" className="platform-cta">▦ {c('workspace')} <span aria-hidden="true">→</span></Link>
      <form className="ask-box" onSubmit={ask}>
        <input ref={fileInputRef} type="file" multiple accept={ATTACH_INPUT_ACCEPT} onChange={(event) => { void addFiles(event.target.files); event.target.value = '' }} className="file-input" />
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} rows={2} maxLength={8000} placeholder={c('placeholder')} aria-label={c('placeholder')} />
        <button type="button" className="attach-button" onClick={() => fileInputRef.current?.click()} disabled={loading || attachments.length >= ATTACH_MAX_FILES} aria-label={t(dict, 'concierge.attach')} title={t(dict, 'concierge.attach')}>📎</button>
        <button type="submit" disabled={(!question.trim() && attachments.length === 0) || loading}>{loading ? c('thinking') : c('send')} <span aria-hidden="true">→</span></button>
      </form>
      {attachments.length ? <div className="attachments" aria-label={t(dict, 'concierge.attach')}>
        {attachments.map((attachment) => <div className="attachment" key={attachment.id}>
          {attachment.isImage ? <img src={attachment.dataUrl} alt={attachment.name} /> : <span aria-hidden="true">📄</span>}
          <span>{attachment.name}</span>
          <button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={t(dict, 'concierge.removeFile')}>×</button>
        </div>)}
      </div> : <p className="drop-hint">📎 {t(dict, 'concierge.dropHint')}</p>}
      {dragOver ? <div className="drop-overlay" aria-live="polite"><strong>{t(dict, 'concierge.dropHere')}</strong><span>{t(dict, 'concierge.dropHint')}</span></div> : null}
      <div className="chips" aria-label={c('suggested')}>{chips.map(key => <button key={key} type="button" onClick={() => setQuestion(c(key))}>{c(key)}</button>)}</div>

      <article className={'answer' + (loading ? ' is-loading' : '') + (failed ? ' is-failed' : '')} aria-live="polite" aria-busy={loading}>
        <div className="answer-label">{c('cosLabel')}</div>
        <div className="answer-content">
          {loading ? (
            <div className="answer-loading"><span>{c('thinking')}</span><div className="answer-placeholder" aria-hidden="true"><i /><i /><i /></div></div>
          ) : answer ? (
            <AssistantMessage content={answer} />
          ) : failed ? (
            <p className="answer-error" role="status">{c('error')}</p>
          ) : (
            <div className="answer-placeholder" aria-hidden="true"><i /><i /><i /></div>
          )}
        </div>
        {answer && handoffConversationId ? <Link href={'/dashboard/assistant?conversation=' + encodeURIComponent(handoffConversationId)}>{c('continue')} →</Link> : null}
        {failed ? <Link href="/dashboard/assistant">{c('continue')} →</Link> : null}
      </article>

      <div className="bottom-row"><p>{c('trust')}</p><Link href="/home">{c('workspace')} <span aria-hidden="true">→</span></Link></div>
    </section>
    <div hidden aria-hidden="true">{listPublicPortableProducts().map(product => <span key={product.manifest.productId}>{product.manifest.productId}</span>)}</div>
    <div hidden aria-hidden="true"><PreviewProjects /></div>
    <style jsx>{`.concierge-home{position:relative;isolation:isolate;display:grid;place-items:center;min-height:calc(100svh - 150px);padding:42px 20px 56px;overflow:hidden;background:#030611;color:#f7f8ff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.aurora{position:absolute;inset:-25%;z-index:-1;background:radial-gradient(circle at 18% 18%,rgba(43,211,255,.19),transparent 24%),radial-gradient(circle at 77% 28%,rgba(245,196,81,.18),transparent 28%),radial-gradient(circle at 50% 96%,rgba(91,76,255,.2),transparent 35%);filter:blur(18px);animation:breathe 12s ease-in-out infinite alternate}@keyframes breathe{to{transform:scale(1.08) translate3d(1%,-1%,0)}}.concierge-panel{position:relative;width:min(850px,100%);padding:clamp(28px,6vw,68px);border:1px solid rgba(255,255,255,.14);border-radius:32px;background:linear-gradient(145deg,rgba(16,24,45,.9),rgba(4,8,21,.78));box-shadow:0 34px 100px rgba(0,0,0,.42);backdrop-filter:blur(22px)}.identity{display:flex;align-items:center;gap:10px;color:#f6c453;font-size:11px;font-weight:850;letter-spacing:.17em}.orb{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:linear-gradient(135deg,#f6c453,#5ce1e6);color:#07111b;font-size:15px;box-shadow:0 0 24px rgba(92,225,230,.42)}h1{max-width:720px;margin:22px 0 14px;font-size:clamp(34px,6vw,66px);line-height:.99;letter-spacing:-.065em}h1 em{font-style:normal;background:linear-gradient(110deg,#fff,#f6c453 62%,#7ee8ef);-webkit-background-clip:text;background-clip:text;color:transparent}.lead{max-width:690px;margin:0;color:#b9c3d8;font-size:clamp(15px,2vw,18px);line-height:1.65}.platform-cta{display:inline-flex;align-items:center;gap:8px;margin-top:18px;color:#f6c453;font-size:13px;font-weight:850;text-decoration:none}.platform-cta:hover{color:#fff}.ask-box{position:relative;margin-top:30px;padding:8px;border:1px solid rgba(140,235,244,.34);border-radius:20px;background:rgba(2,8,23,.65);box-shadow:0 0 0 5px rgba(26,240,255,.035);display:flex;gap:8px;align-items:stretch}.file-input{display:none}.ask-box textarea{min-width:0;flex:1;resize:none;border:0;background:transparent;color:#fff;padding:12px 14px;font:inherit;line-height:1.45;outline:0}.ask-box textarea::placeholder{color:#74829c}.ask-box button{border:0;border-radius:14px;padding:0 20px;background:linear-gradient(135deg,#f7ca5c,#d9952c);color:#151008;font-weight:850;cursor:pointer;white-space:nowrap}.ask-box .attach-button{width:46px;padding:0;background:rgba(255,255,255,.08);color:#fff;font-size:17px}.ask-box button:disabled{opacity:.55;cursor:not-allowed}.attachments{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.attachment{display:flex;max-width:220px;align-items:center;gap:7px;padding:5px 7px 5px 5px;border:1px solid rgba(255,255,255,.13);border-radius:10px;background:rgba(255,255,255,.06);font-size:11px;color:#dbe6f7}.attachment img,.attachment>span:first-child{width:26px;height:26px;border-radius:6px;object-fit:cover}.attachment>span:nth-child(2){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.attachment button{border:0;background:transparent;color:#b9c3d8;cursor:pointer;font-size:16px}.drop-hint{margin:10px 2px 0;color:#8996ae;font-size:11px}.drop-overlay{position:absolute;inset:16px;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:2px dashed #7ee8ef;border-radius:24px;background:rgba(4,11,29,.93);color:#fff;text-align:center}.drop-overlay strong{color:#7ee8ef}.drop-overlay span{color:#b9c3d8;font-size:12px}.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.chips button{border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.045);color:#d5ddec;padding:8px 11px;font-size:12px;cursor:pointer}.chips button:hover{border-color:#7ee8ef;color:#fff}.answer{min-height:154px;margin-top:20px;padding:20px;border:1px solid rgba(126,232,239,.25);border-radius:18px;background:rgba(14,37,55,.56);box-shadow:0 18px 50px rgba(0,0,0,.2);transition:border-color .2s ease,background .2s ease}.answer.is-loading{border-color:rgba(126,232,239,.5)}.answer.is-failed{border-color:rgba(252,165,165,.3)}.answer-label{color:#7ee8ef;font-size:11px;font-weight:900;letter-spacing:.14em}.answer-content{min-height:76px;margin:10px 0 16px;line-height:1.6;color:#e8edf7;white-space:normal}.answer-loading{display:grid;gap:12px;color:#9fb0c9;font-size:12px}.answer-placeholder{display:grid;gap:9px;max-width:94%;padding-top:5px}.answer-placeholder i{display:block;height:9px;border-radius:999px;background:linear-gradient(90deg,rgba(126,232,239,.08),rgba(255,255,255,.09),rgba(126,232,239,.08));animation:answerPulse 1.8s ease-in-out infinite}.answer-placeholder i:nth-child(2){width:82%}.answer-placeholder i:nth-child(3){width:61%}@keyframes answerPulse{50%{opacity:.45}}.answer-error{margin:0;color:#fecaca}.answer a,.bottom-row a{color:#f6c453;font-weight:800;text-decoration:none}.bottom-row{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,.1)}.bottom-row p{max-width:520px;margin:0;color:#8996ae;font-size:11px;line-height:1.55}.bottom-row a{white-space:nowrap;font-size:13px}@media(max-width:620px){.concierge-home{padding:22px 12px 34px}.concierge-panel{padding:28px 20px;border-radius:24px}.ask-box{flex-wrap:wrap}.ask-box textarea{flex-basis:calc(100% - 54px)}.ask-box button[type="submit"]{height:46px;flex:1}.bottom-row{align-items:flex-start;flex-direction:column}}`}</style>
  </section>
}
