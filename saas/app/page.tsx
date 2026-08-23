'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PreviewProjects } from '@/components/home/PreviewProjects'
import { t } from '@/lib/i18n/t'
import { listPublicPortableProducts } from '@/lib/portable-products'

export default function Home() {
  const { dict, lang } = useI18n()
  const c = (key: string) => t(dict, `homepage.concierge.${key}`)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const chips = ['grow', 'review', 'campaign', 'show']

  async function ask(event?: FormEvent) {
    event?.preventDefault()
    const prompt = question.trim()
    if (!prompt || loading) return
    setLoading(true); setAnswer(''); setFailed(false)
    try {
      const response = await fetch('/api/concierge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: { language: lang, currentPage: '/' } }) })
      const payload = await response.json().catch(() => null)
      const reply = String(payload?.reply || payload?.error || '').trim()
      if (!response.ok || !reply) throw new Error('concierge_unavailable')
      setAnswer(reply)
    } catch { setFailed(true) } finally { setLoading(false) }
  }

  return <main className="concierge-home">
    <div className="aurora" aria-hidden="true" />
    <section className="concierge-panel" aria-label={c('eyebrow')}>
      <div className="identity"><span className="orb" aria-hidden="true">✦</span><span>{c('eyebrow')}</span></div>
      <h1>{c('greeting')}<br /><em>{c('headline')}</em></h1>
      <p className="lead">{c('subhead')}</p>
      <form className="ask-box" onSubmit={ask}>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} maxLength={8000} placeholder={c('placeholder')} aria-label={c('placeholder')} />
        <button type="submit" disabled={!question.trim() || loading}>{loading ? c('thinking') : c('send')} <span aria-hidden="true">→</span></button>
      </form>
      <div className="chips" aria-label={c('suggested')}>{chips.map(key => <button key={key} type="button" onClick={() => setQuestion(c(key))}>{c(key)}</button>)}</div>
      {answer ? <article className="answer" aria-live="polite"><div className="answer-label">{c('cosLabel')}</div><p>{answer}</p><Link href={'/dashboard/assistant?prompt=' + encodeURIComponent(question)}>{c('continue')} →</Link></article> : null}
      {failed ? <p className="failure" role="status">{c('error')} <Link href="/dashboard/assistant">{c('continue')} →</Link></p> : null}
      <div className="bottom-row"><p>{c('trust')}</p><Link href="/home">{c('workspace')} <span aria-hidden="true">→</span></Link></div>
    </section>
    <div hidden aria-hidden="true">{listPublicPortableProducts().map(product => <span key={product.manifest.productId}>{product.manifest.productId}</span>)}</div>
    <div hidden aria-hidden="true"><PreviewProjects /></div>
    <style jsx>{`.concierge-home{position:relative;isolation:isolate;display:grid;place-items:center;min-height:calc(100svh - 150px);padding:42px 20px 56px;overflow:hidden;background:#030611;color:#f7f8ff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.aurora{position:absolute;inset:-25%;z-index:-1;background:radial-gradient(circle at 18% 18%,rgba(43,211,255,.19),transparent 24%),radial-gradient(circle at 77% 28%,rgba(245,196,81,.18),transparent 28%),radial-gradient(circle at 50% 96%,rgba(91,76,255,.2),transparent 35%);filter:blur(18px);animation:breathe 12s ease-in-out infinite alternate}@keyframes breathe{to{transform:scale(1.08) translate3d(1%,-1%,0)}}.concierge-panel{width:min(850px,100%);padding:clamp(28px,6vw,68px);border:1px solid rgba(255,255,255,.14);border-radius:32px;background:linear-gradient(145deg,rgba(16,24,45,.9),rgba(4,8,21,.78));box-shadow:0 34px 100px rgba(0,0,0,.42);backdrop-filter:blur(22px)}.identity{display:flex;align-items:center;gap:10px;color:#f6c453;font-size:11px;font-weight:850;letter-spacing:.17em}.orb{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:linear-gradient(135deg,#f6c453,#5ce1e6);color:#07111b;font-size:15px;box-shadow:0 0 24px rgba(92,225,230,.42)}h1{max-width:720px;margin:22px 0 14px;font-size:clamp(34px,6vw,66px);line-height:.99;letter-spacing:-.065em}h1 em{font-style:normal;background:linear-gradient(110deg,#fff,#f6c453 62%,#7ee8ef);-webkit-background-clip:text;background-clip:text;color:transparent}.lead{max-width:690px;margin:0;color:#b9c3d8;font-size:clamp(15px,2vw,18px);line-height:1.65}.ask-box{margin-top:30px;padding:8px;border:1px solid rgba(140,235,244,.34);border-radius:20px;background:rgba(2,8,23,.65);box-shadow:0 0 0 5px rgba(26,240,255,.035);display:flex;gap:10px;align-items:stretch}.ask-box textarea{min-width:0;flex:1;resize:none;border:0;background:transparent;color:#fff;padding:12px 14px;font:inherit;line-height:1.45;outline:0}.ask-box textarea::placeholder{color:#74829c}.ask-box button{border:0;border-radius:14px;padding:0 20px;background:linear-gradient(135deg,#f7ca5c,#d9952c);color:#151008;font-weight:850;cursor:pointer;white-space:nowrap}.ask-box button:disabled{opacity:.55;cursor:not-allowed}.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.chips button{border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.045);color:#d5ddec;padding:8px 11px;font-size:12px;cursor:pointer}.chips button:hover{border-color:#7ee8ef;color:#fff}.answer{margin-top:20px;padding:20px;border:1px solid rgba(126,232,239,.25);border-radius:18px;background:rgba(14,37,55,.56)}.answer-label{color:#7ee8ef;font-size:11px;font-weight:900;letter-spacing:.14em}.answer p{white-space:pre-wrap;margin:9px 0 14px;line-height:1.6;color:#e8edf7}.answer a,.failure a,.bottom-row a{color:#f6c453;font-weight:800;text-decoration:none}.failure{margin:18px 0 0;color:#fecaca;line-height:1.5}.bottom-row{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,.1)}.bottom-row p{max-width:520px;margin:0;color:#8996ae;font-size:11px;line-height:1.55}.bottom-row a{white-space:nowrap;font-size:13px}@media(max-width:620px){.concierge-home{padding:22px 12px 34px}.concierge-panel{padding:28px 20px;border-radius:24px}.ask-box{flex-direction:column}.ask-box button{height:46px}.bottom-row{align-items:flex-start;flex-direction:column}}`}</style>
  </main>
}
