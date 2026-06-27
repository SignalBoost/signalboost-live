'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Source = 'website_optimizer' | 'repo_check' | 'cybersecurity_check' | 'audit_preview'

type Copy = {
  back: string
  badge: string
  title: string
  body: string
  source: string
  targetUrl: string
  name: string
  email: string
  company: string
  submit: string
  submitting: string
  successTitle: string
  successBody: string
  saved: string
  queued: string
  notSaved: string
  safe: string
  missing: string
  error: string
  options: Record<Source, string>
}

const COPY: Record<Lang, Copy> = {
  en: { back: 'SignalBoost', badge: 'Owner-approved growth follow-up', title: 'Request a SignalBoost improvement plan.', body: 'After using a public SignalBoost tool, send the result to the COS Marketing + Sales engine. The system creates a tagged lead and prepares a follow-up plan for owner review. Nothing is sent automatically.', source: 'Tool used', targetUrl: 'Website or repo URL checked', name: 'Your name', email: 'Work email', company: 'Company', submit: 'Request improvement plan', submitting: 'Preparing…', successTitle: 'Lead intake created', successBody: 'The request is now ready for owner review in the Marketing + Sales workflow.', saved: 'Saved to owner queue', queued: 'Pending owner approval', notSaved: 'Prepared, but not saved to the owner queue yet', safe: 'No automatic email, no hidden follow-up, and no changes without approval.', missing: 'Please complete the required fields.', error: 'Could not create this request.', options: { website_optimizer: 'Website Optimizer', repo_check: 'Repo / Audit Check', cybersecurity_check: 'Cybersecurity Check', audit_preview: 'Audit Preview' } },
  es: { back: 'SignalBoost', badge: 'Seguimiento aprobado por propietario', title: 'Solicita un plan de mejora de SignalBoost.', body: 'Después de usar una herramienta pública de SignalBoost, envía el resultado al motor COS Marketing + Ventas. El sistema crea un lead etiquetado y prepara un plan de seguimiento para revisión del propietario. Nada se envía automáticamente.', source: 'Herramienta usada', targetUrl: 'URL de sitio o repo revisado', name: 'Tu nombre', email: 'Email de trabajo', company: 'Empresa', submit: 'Solicitar plan de mejora', submitting: 'Preparando…', successTitle: 'Lead intake creado', successBody: 'La solicitud ya está lista para revisión del propietario en Marketing + Ventas.', saved: 'Guardado en la cola del propietario', queued: 'Pendiente de aprobación del propietario', notSaved: 'Preparado, pero aún no guardado en la cola del propietario', safe: 'Sin email automático, sin seguimiento oculto y sin cambios sin aprobación.', missing: 'Completa los campos requeridos.', error: 'No se pudo crear esta solicitud.', options: { website_optimizer: 'Optimizador Web', repo_check: 'Repo / Auditoría', cybersecurity_check: 'Revisión de Ciberseguridad', audit_preview: 'Vista de Auditoría' } },
  pt: { back: 'SignalBoost', badge: 'Follow-up aprovado pelo proprietário', title: 'Solicite um plano de melhoria do SignalBoost.', body: 'Depois de usar uma ferramenta pública do SignalBoost, envie o resultado ao motor COS Marketing + Vendas. O sistema cria um lead com tags e prepara um plano de follow-up para revisão do proprietário. Nada é enviado automaticamente.', source: 'Ferramenta usada', targetUrl: 'URL do site ou repo verificado', name: 'Seu nome', email: 'Email profissional', company: 'Empresa', submit: 'Solicitar plano de melhoria', submitting: 'Preparando…', successTitle: 'Lead intake criado', successBody: 'A solicitação está pronta para revisão do proprietário no fluxo Marketing + Vendas.', saved: 'Salvo na fila do proprietário', queued: 'Pendente de aprovação do proprietário', notSaved: 'Preparado, mas ainda não salvo na fila do proprietário', safe: 'Sem email automático, sem follow-up oculto e sem mudanças sem aprovação.', missing: 'Preencha os campos obrigatórios.', error: 'Não foi possível criar esta solicitação.', options: { website_optimizer: 'Otimizador de Site', repo_check: 'Repo / Auditoria', cybersecurity_check: 'Verificação de Cibersegurança', audit_preview: 'Prévia de Auditoria' } },
  pl: { back: 'SignalBoost', badge: 'Follow-up zatwierdzany przez właściciela', title: 'Poproś o plan ulepszeń SignalBoost.', body: 'Po użyciu publicznego narzędzia SignalBoost wyślij wynik do silnika COS Marketing + Sprzedaż. System tworzy otagowanego leada i przygotowuje plan follow-up do przeglądu właściciela. Nic nie wysyła się automatycznie.', source: 'Użyte narzędzie', targetUrl: 'Sprawdzony URL strony lub repo', name: 'Imię i nazwisko', email: 'Email firmowy', company: 'Firma', submit: 'Poproś o plan ulepszeń', submitting: 'Przygotowywanie…', successTitle: 'Lead intake utworzony', successBody: 'Prośba jest gotowa do przeglądu właściciela w workflow Marketing + Sprzedaż.', saved: 'Zapisano w kolejce właściciela', queued: 'Oczekuje na akceptację właściciela', notSaved: 'Przygotowano, ale jeszcze nie zapisano w kolejce właściciela', safe: 'Bez automatycznego emaila, ukrytego follow-up i zmian bez akceptacji.', missing: 'Uzupełnij wymagane pola.', error: 'Nie udało się utworzyć tej prośby.', options: { website_optimizer: 'Optymalizator Strony', repo_check: 'Repo / Audyt', cybersecurity_check: 'Test Cyberbezpieczeństwa', audit_preview: 'Podgląd Audytu' } },
  ru: { back: 'SignalBoost', badge: 'Follow-up с утверждением владельца', title: 'Запросите план улучшений SignalBoost.', body: 'После использования публичного инструмента SignalBoost отправьте результат в COS Marketing + Sales engine. Система создаёт tagged lead и готовит follow-up план для проверки владельцем. Ничего не отправляется автоматически.', source: 'Использованный инструмент', targetUrl: 'Проверенный URL сайта или repo', name: 'Ваше имя', email: 'Рабочий email', company: 'Компания', submit: 'Запросить план улучшений', submitting: 'Подготовка…', successTitle: 'Lead intake создан', successBody: 'Запрос готов к проверке владельцем в workflow Marketing + Sales.', saved: 'Сохранено в очереди владельца', queued: 'Ожидает утверждения владельца', notSaved: 'Подготовлено, но ещё не сохранено в очереди владельца', safe: 'Без автоматического email, скрытого follow-up и изменений без утверждения.', missing: 'Заполните обязательные поля.', error: 'Не удалось создать этот запрос.', options: { website_optimizer: 'Website Optimizer', repo_check: 'Repo / Audit Check', cybersecurity_check: 'Cybersecurity Check', audit_preview: 'Audit Preview' } },
}

function activeLang(lang: string): Lang { return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang }
function toCosLocale(lang: Lang) { return lang === 'pt' ? 'pt-BR' : lang }
function sourceFromQuery(value: string | null): Source { return value === 'repo_check' || value === 'cybersecurity_check' || value === 'audit_preview' ? value : 'website_optimizer' }

export default function RequestPlanPage() {
  const { lang } = useI18n()
  const langCode = activeLang(lang)
  const copy = COPY[langCode]
  const [source, setSource] = useState<Source>('website_optimizer')
  const [targetUrl, setTargetUrl] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSource(sourceFromQuery(params.get('source')))
    const target = params.get('target')
    if (target) setTargetUrl(target)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !targetUrl.trim()) { setError(copy.missing); return }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/public/lead-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, targetUrl, name, email, company, locale: toCosLocale(langCode), tags: ['public-lead-magnet'] }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.ok) { setError(copy.error); return }
      setResult(json.intake)
    } catch {
      setError(copy.error)
    } finally {
      setLoading(false)
    }
  }

  const saved = Boolean(result?.storage?.saved)

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-semibold text-cyan-200 hover:text-white">← {copy.back}</Link>
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-cyan-950/30">
          <span className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">{copy.badge}</span>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-white md:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{copy.body}</p>
          <p className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-50">{copy.safe}</p>

          <form onSubmit={submit} className="mt-8 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.source}</span>
              <select value={source} onChange={event => setSource(event.target.value as Source)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4">
                <option value="website_optimizer">{copy.options.website_optimizer}</option>
                <option value="repo_check">{copy.options.repo_check}</option>
                <option value="cybersecurity_check">{copy.options.cybersecurity_check}</option>
                <option value="audit_preview">{copy.options.audit_preview}</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-slate-200"><span>{copy.targetUrl}</span><input value={targetUrl} onChange={event => setTargetUrl(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" /></label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-slate-200"><span>{copy.name}</span><input value={name} onChange={event => setName(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" /></label>
              <label className="grid gap-2 text-sm font-bold text-slate-200"><span>{copy.email}</span><input value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" /></label>
            </div>
            <label className="grid gap-2 text-sm font-bold text-slate-200"><span>{copy.company}</span><input value={company} onChange={event => setCompany(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" /></label>
            <button type="submit" disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">{loading ? copy.submitting : copy.submit}</button>
          </form>

          {error && <div className="mt-4 rounded-xl border border-red-300/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{error}</div>}
          {result && <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-emerald-50"><h2 className="text-2xl font-black">{copy.successTitle}</h2><p className="mt-2 text-sm leading-6">{copy.successBody}</p><div className="mt-4 grid gap-2 text-sm font-semibold"><span>{saved ? copy.saved : copy.notSaved}</span><span>{copy.queued}</span></div></div>}
        </div>
      </section>
    </main>
  )
}
