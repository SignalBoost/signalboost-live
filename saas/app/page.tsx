// saas/app/page.tsx
'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Copy = Record<Lang, string>

const copy = (values: Copy, lang: string) => values[(Object.prototype.hasOwnProperty.call(values, lang) ? lang : 'en') as Lang]

const TEXT = {
  eyebrow: { en: 'YOUR SIGNALBOOST CONCIERGE', es: 'TU CONCIERGE DE SIGNALBOOST', pt: 'SEU CONCIERGE SIGNALBOOST', pl: 'TWÓJ CONCIERGE SIGNALBOOST', ru: 'ВАШ КОНСЬЕРЖ SIGNALBOOST' },
  greeting: { en: 'Hello — I’m COS.', es: 'Hola — soy COS.', pt: 'Olá — sou COS.', pl: 'Cześć — jestem COS.', ru: 'Здравствуйте — я COS.' },
  headline: { en: 'What would you like to accomplish today?', es: '¿Qué te gustaría lograr hoy?', pt: 'O que você gostaria de realizar hoje?', pl: 'Co chcesz dziś osiągnąć?', ru: 'Чего вы хотите достичь сегодня?' },
  subhead: { en: 'Ask a question, describe a goal, or tell me where you want to go. I will help you find the right SignalBoost workspace and provide an evidence-grounded answer when one is available.', es: 'Haz una pregunta, describe un objetivo o dime adónde quieres ir. Te ayudaré a encontrar el espacio de SignalBoost adecuado y, cuando sea posible, daré una respuesta basada en evidencia.', pt: 'Faça uma pergunta, descreva um objetivo ou diga para onde quer ir. Vou ajudar você a encontrar o espaço certo do SignalBoost e, quando disponível, dar uma resposta baseada em evidências.', pl: 'Zadaj pytanie, opisz cel lub powiedz, dokąd chcesz przejść. Pomogę znaleźć właściwy obszar SignalBoost i, gdy to możliwe, podam odpowiedź opartą na dowodach.', ru: 'Задайте вопрос, опишите цель или скажите, куда хотите перейти. Я помогу найти нужный раздел SignalBoost и, когда это возможно, дам ответ, основанный на доказательствах.' },
  placeholder: { en: 'Ask COS anything…', es: 'Pregúntale cualquier cosa a COS…', pt: 'Pergunte qualquer coisa ao COS…', pl: 'Zapytaj COS o cokolwiek…', ru: 'Спросите COS о чём угодно…' },
  send: { en: 'Ask COS', es: 'Preguntar a COS', pt: 'Perguntar ao COS', pl: 'Zapytaj COS', ru: 'Спросить COS' },
  thinking: { en: 'COS is thinking…', es: 'COS está pensando…', pt: 'COS está pensando…', pl: 'COS myśli…', ru: 'COS думает…' },
  continue: { en: 'Continue the conversation', es: 'Continuar la conversación', pt: 'Continuar a conversa', pl: 'Kontynuuj rozmowę', ru: 'Продолжить разговор' },
  workspace: { en: 'Explore the platform', es: 'Explorar la plataforma', pt: 'Explorar a plataforma', pl: 'Odkryj platformę', ru: 'Открыть платформу' },
  trust: { en: 'COS uses governed reasoning, respects approval boundaries, and does not present uncertain information as fact.', es: 'COS usa razonamiento gobernado, respeta los límites de aprobación y no presenta información incierta como un hecho.', pt: 'O COS usa raciocínio governado, respeita limites de aprovação e não apresenta informação incerta como fato.', pl: 'COS stosuje kontrolowane wnioskowanie, respektuje granice zatwierdzania i nie przedstawia niepewnych informacji jako faktów.', ru: 'COS использует управляемое рассуждение, соблюдает границы утверждений и не выдаёт неопределённую информацию за факт.' },
  error: { en: 'I could not reach COS just now. You can continue in the Concierge workspace.', es: 'No pude conectar con COS ahora. Puedes continuar en el espacio de Concierge.', pt: 'Não consegui conectar ao COS agora. Você pode continuar no espaço do Concierge.', pl: 'Nie udało się teraz połączyć z COS. Możesz kontynuować w obszarze Concierge.', ru: 'Сейчас не удалось связаться с COS. Вы можете продолжить в разделе Concierge.' },
  chips: [
    { en: 'Help me grow my business', es: 'Ayúdame a crecer mi negocio', pt: 'Ajude a crescer meu negócio', pl: 'Pomóż mi rozwinąć firmę', ru: 'Помогите развить бизнес' },
    { en: 'Review my website', es: 'Revisa mi sitio web', pt: 'Analise meu site', pl: 'Oceń moją stronę', ru: 'Проверьте мой сайт' },
    { en: 'Plan a campaign', es: 'Planifica una campaña', pt: 'Planeje uma campanha', pl: 'Zaplanuj kampanię', ru: 'Спланируйте кампанию' },
    { en: 'Show me what SignalBoost can do', es: 'Muéstrame qué puede hacer SignalBoost', pt: 'Mostre o que o SignalBoost pode fazer', pl: 'Pokaż, co potrafi SignalBoost', ru: 'Покажите возможности SignalBoost' },
  ] as Copy[],
}

export default function Home() {
  const { lang } = useI18n()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const language = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang

  async function ask(event?: FormEvent) {
    event?.preventDefault()
    const prompt = question.trim()
    if (!prompt || loading) return
    setLoading(true)
    setAnswer('')
    setFailed(false)
    try {
      const response = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          context: { language, currentPage: '/' },
        }),
      })
      const payload = await response.json().catch(() => null)
      const reply = String(payload?.reply || payload?.error || '').trim()
      if (!response.ok || !reply) throw new Error('concierge_unavailable')
      setAnswer(reply)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="concierge-home">
      <div className="aurora" aria-hidden="true" />
      <section className="concierge-panel" aria-label={copy(TEXT.eyebrow, language)}>
        <div className="identity"><span className="orb" aria-hidden="true">✦</span><span>{copy(TEXT.eyebrow, language)}</span></div>
        <h1>{copy(TEXT.greeting, language)}<br /><em>{copy(TEXT.headline, language)}</em></h1>
        <p className="lead">{copy(TEXT.subhead, language)}</p>

        <form className="ask-box" onSubmit={ask}>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} maxLength={8000} placeholder={copy(TEXT.placeholder, language)} aria-label={copy(TEXT.placeholder, language)} />
          <button type="submit" disabled={!question.trim() || loading}>{loading ? copy(TEXT.thinking, language) : copy(TEXT.send, language)} <span aria-hidden="true">→</span></button>
        </form>

        <div className="chips" aria-label="Suggested questions">
          {TEXT.chips.map((chip) => <button key={chip.en} type="button" onClick={() => setQuestion(copy(chip, language))}>{copy(chip, language)}</button>)}
        </div>

        {answer ? (
          <article className="answer" aria-live="polite">
            <div className="answer-label">COS</div>
            <p>{answer}</p>
            <Link href={'/dashboard/assistant?prompt=' + encodeURIComponent(question)}>{copy(TEXT.continue, language)} →</Link>
          </article>
        ) : null}

        {failed ? <p className="failure" role="status">{copy(TEXT.error, language)} <Link href="/dashboard/assistant">{copy(TEXT.continue, language)} →</Link></p> : null}

        <div className="bottom-row">
          <p>{copy(TEXT.trust, language)}</p>
          <Link href="/home">{copy(TEXT.workspace, language)} <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <style jsx>{`
        .concierge-home{position:relative;isolation:isolate;display:grid;place-items:center;min-height:calc(100svh - 150px);padding:42px 20px 56px;overflow:hidden;background:#030611;color:#f7f8ff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.aurora{position:absolute;inset:-25%;z-index:-1;background:radial-gradient(circle at 18% 18%,rgba(43,211,255,.19),transparent 24%),radial-gradient(circle at 77% 28%,rgba(245,196,81,.18),transparent 28%),radial-gradient(circle at 50% 96%,rgba(91,76,255,.2),transparent 35%);filter:blur(18px);animation:breathe 12s ease-in-out infinite alternate}@keyframes breathe{to{transform:scale(1.08) translate3d(1%,-1%,0)}}.concierge-panel{width:min(850px,100%);padding:clamp(28px,6vw,68px);border:1px solid rgba(255,255,255,.14);border-radius:32px;background:linear-gradient(145deg,rgba(16,24,45,.9),rgba(4,8,21,.78));box-shadow:0 34px 100px rgba(0,0,0,.42);backdrop-filter:blur(22px)}.identity{display:flex;align-items:center;gap:10px;color:#f6c453;font-size:11px;font-weight:850;letter-spacing:.17em}.orb{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:linear-gradient(135deg,#f6c453,#5ce1e6);color:#07111b;font-size:15px;box-shadow:0 0 24px rgba(92,225,230,.42)}h1{max-width:720px;margin:22px 0 14px;font-size:clamp(34px,6vw,66px);line-height:.99;letter-spacing:-.065em}h1 em{font-style:normal;background:linear-gradient(110deg,#fff,#f6c453 62%,#7ee8ef);-webkit-background-clip:text;background-clip:text;color:transparent}.lead{max-width:690px;margin:0;color:#b9c3d8;font-size:clamp(15px,2vw,18px);line-height:1.65}.ask-box{margin-top:30px;padding:8px;border:1px solid rgba(140,235,244,.34);border-radius:20px;background:rgba(2,8,23,.65);box-shadow:0 0 0 5px rgba(26,240,255,.035);display:flex;gap:10px;align-items:stretch}.ask-box textarea{min-width:0;flex:1;resize:none;border:0;background:transparent;color:#fff;padding:12px 14px;font:inherit;line-height:1.45;outline:0}.ask-box textarea::placeholder{color:#74829c}.ask-box button{border:0;border-radius:14px;padding:0 20px;background:linear-gradient(135deg,#f7ca5c,#d9952c);color:#151008;font-weight:850;cursor:pointer;white-space:nowrap}.ask-box button:disabled{opacity:.55;cursor:not-allowed}.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.chips button{border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.045);color:#d5ddec;padding:8px 11px;font-size:12px;cursor:pointer}.chips button:hover{border-color:#7ee8ef;color:#fff}.answer{margin-top:20px;padding:20px;border:1px solid rgba(126,232,239,.25);border-radius:18px;background:rgba(14,37,55,.56)}.answer-label{color:#7ee8ef;font-size:11px;font-weight:900;letter-spacing:.14em}.answer p{white-space:pre-wrap;margin:9px 0 14px;line-height:1.6;color:#e8edf7}.answer a,.failure a,.bottom-row a{color:#f6c453;font-weight:800;text-decoration:none}.failure{margin:18px 0 0;color:#fecaca;line-height:1.5}.bottom-row{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,.1)}.bottom-row p{max-width:520px;margin:0;color:#8996ae;font-size:11px;line-height:1.55}.bottom-row a{white-space:nowrap;font-size:13px}@media(max-width:620px){.concierge-home{padding:22px 12px 34px}.concierge-panel{padding:28px 20px;border-radius:24px}.ask-box{flex-direction:column}.ask-box button{height:46px}.bottom-row{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  )
}
