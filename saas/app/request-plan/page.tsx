// saas/app/request-plan/page.tsx
'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'
import { PUBLIC_BRAND } from '@/lib/public-brand'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Source = 'website_optimizer' | 'repo_check' | 'cybersecurity_check' | 'audit_preview'

type Copy = {
  back: string
  badge: string
  title: string
  body: string
  safe: string
  source: string
  targetUrl: string
  company: string
  optional: string
  continue: string
  pricing: string
  note: string
  name: string
  email: string
  submit: string
  submitting: string
  successTitle: string
  successBody: string
  saved: string
  queued: string
  notSaved: string
  missing: string
  error: string
  options: Record<Source, string>
}

const COPY: Record<Lang, Copy> = {
  en: {
    back: uiText('generatedUi.u_85647deec9865df5'),
    badge: uiText('generatedUi.u_298a9207a732a11d'),
    title: uiText('generatedUi.u_6355c7c1bd1fe92c'),
    body: uiText('generatedUi.u_e7537dc059c3458d'),
    safe: uiText('generatedUi.u_5a47e8e668406538'),
    source: uiText('generatedUi.u_9b41efae340c46c7'),
    targetUrl: uiText('generatedUi.u_b5a9404423a3f5ea'),
    company: uiText('generatedUi.u_de4743c879734dc3'),
    optional: uiText('generatedUi.u_ec91fdd9256cb75a'),
    continue: uiText('generatedUi.u_fdb09f83be950afc'),
    pricing: uiText('generatedUi.u_434dc3a581a65a52'),
    note: uiText('generatedUi.u_90c6387f50e3f25b'),
    name: 'Your name',
    email: 'Work email',
    submit: 'Request improvement plan',
    submitting: 'Preparing…',
    successTitle: 'Lead intake created',
    successBody: 'The request is now ready for owner review in the Marketing + Sales workflow.',
    saved: 'Saved to owner queue',
    queued: 'Pending owner approval',
    notSaved: 'Prepared, but not saved to the owner queue yet',
    missing: 'Please complete the required fields.',
    error: 'Could not create this request.',
    options: { website_optimizer: uiText('generatedUi.u_7c0cbab9b791858b'), repo_check: uiText('generatedUi.u_870d4209c4350829'), cybersecurity_check: uiText('generatedUi.u_ed915f985534a061'), audit_preview: uiText('generatedUi.u_bfde463a8a1587f3') },
  },
  es: {
    back: PUBLIC_BRAND.name,
    badge: 'Siguiente paso',
    title: `Continúa en ${PUBLIC_BRAND.name} para corregir esto.`,
    body: `La herramienta pública gratuita ya mostró la señal. Para corregir el problema o convertirlo en un flujo completo de mejora, continúa a ${PUBLIC_BRAND.name} y regístrate como cualquier otro cliente.`,
    safe: 'Sin email automático, sin seguimiento oculto y sin cambios sin aprobación.',
    source: 'Herramienta usada',
    targetUrl: 'Sitio o repo revisado',
    company: 'Empresa',
    optional: 'opcional',
    continue: `Continuar a ${PUBLIC_BRAND.name}`,
    pricing: 'Ver precios',
    note: 'La información de la empresa es opcional. Solo ayuda a mantener claro el contexto al continuar.',
    name: 'Tu nombre',
    email: 'Email de trabajo',
    submit: 'Solicitar plan de mejora',
    submitting: 'Preparando…',
    successTitle: 'Lead intake creado',
    successBody: 'La solicitud ya está lista para revisión del propietario en Marketing + Ventas.',
    saved: 'Guardado en la cola del propietario',
    queued: 'Pendiente de aprobación del propietario',
    notSaved: 'Preparado, pero aún no guardado en la cola del propietario',
    missing: 'Completa los campos requeridos.',
    error: 'No se pudo crear esta solicitud.',
    options: { website_optimizer: 'Optimizador Web', repo_check: 'Repo / Auditoría', cybersecurity_check: 'Revisión de Ciberseguridad', audit_preview: 'Vista de Auditoría' },
  },
  pt: {
    back: PUBLIC_BRAND.name,
    badge: 'Próximo passo',
    title: `Continue no ${PUBLIC_BRAND.name} para corrigir isso.`,
    body: `A ferramenta pública gratuita já mostrou o sinal. Para corrigir o problema ou transformá-lo em um fluxo completo de melhoria, continue para o ${PUBLIC_BRAND.name} e cadastre-se como qualquer outro cliente.`,
    safe: 'Sem email automático, sem follow-up oculto e sem mudanças sem aprovação.',
    source: 'Ferramenta usada',
    targetUrl: 'Site ou repo verificado',
    company: 'Empresa',
    optional: 'opcional',
    continue: `Continuar para o ${PUBLIC_BRAND.name}`,
    pricing: 'Ver preços',
    note: 'A informação da empresa é opcional. Ela apenas ajuda a manter o contexto claro ao continuar.',
    name: 'Seu nome',
    email: 'Email profissional',
    submit: 'Solicitar plano de melhoria',
    submitting: 'Preparando…',
    successTitle: 'Lead intake criado',
    successBody: 'A solicitação está pronta para revisão do proprietário no fluxo Marketing + Vendas.',
    saved: 'Salvo na fila do proprietário',
    queued: 'Pendente de aprovação do proprietário',
    notSaved: 'Preparado, mas ainda não salvo na fila do proprietário',
    missing: 'Preencha os campos obrigatórios.',
    error: 'Não foi possível criar esta solicitação.',
    options: { website_optimizer: 'Otimizador de Site', repo_check: 'Repo / Auditoria', cybersecurity_check: 'Verificação de Cibersegurança', audit_preview: 'Prévia de Auditoria' },
  },
  pl: {
    back: PUBLIC_BRAND.name,
    badge: 'Następny krok',
    title: `Kontynuuj w ${PUBLIC_BRAND.name}, aby to naprawić.`,
    body: `Darmowe publiczne narzędzie pokazało już sygnał. Aby naprawić problem albo zmienić go w pełny workflow ulepszeń, przejdź do ${PUBLIC_BRAND.name} i zarejestruj się jak każdy klient.`,
    safe: 'Bez automatycznego emaila, ukrytego follow-up i zmian bez akceptacji.',
    source: 'Użyte narzędzie',
    targetUrl: 'Sprawdzona strona lub repo',
    company: 'Firma',
    optional: 'opcjonalnie',
    continue: `Kontynuuj do ${PUBLIC_BRAND.name}`,
    pricing: 'Zobacz ceny',
    note: 'Informacja o firmie jest opcjonalna. Pomaga tylko zachować jasny kontekst po przejściu dalej.',
    name: 'Imię i nazwisko',
    email: 'Email firmowy',
    submit: 'Poproś o plan ulepszeń',
    submitting: 'Przygotowywanie…',
    successTitle: 'Lead intake utworzony',
    successBody: 'Prośba jest gotowa do przeglądu właściciela w workflow Marketing + Sprzedaż.',
    saved: 'Zapisano w kolejce właściciela',
    queued: 'Oczekuje na akceptację właściciela',
    notSaved: 'Przygotowano, ale jeszcze nie zapisano w kolejce właściciela',
    missing: 'Uzupełnij wymagane pola.',
    error: 'Nie udało się utworzyć tej prośby.',
    options: { website_optimizer: 'Optymalizator Strony', repo_check: 'Repo / Audyt', cybersecurity_check: 'Test Cyberbezpieczeństwa', audit_preview: 'Podgląd Audytu' },
  },
  ru: {
    back: PUBLIC_BRAND.name,
    badge: 'Следующий шаг',
    title: `Продолжите в ${PUBLIC_BRAND.name}, чтобы это исправить.`,
    body: `Бесплатный публичный инструмент уже показал сигнал. Чтобы исправить проблему или превратить её в полный workflow улучшений, перейдите в ${PUBLIC_BRAND.name} и зарегистрируйтесь как обычный клиент.`,
    safe: 'Без автоматического email, скрытого follow-up и изменений без утверждения.',
    source: 'Использованный инструмент',
    targetUrl: 'Проверенный сайт или repo',
    company: 'Компания',
    optional: 'необязательно',
    continue: `Продолжить в ${PUBLIC_BRAND.name}`,
    pricing: 'Посмотреть цены',
    note: 'Информация о компании необязательна. Она только помогает сохранить контекст при продолжении.',
    name: 'Ваше имя',
    email: 'Рабочий email',
    submit: 'Запросить план улучшений',
    submitting: 'Подготовка…',
    successTitle: 'Lead intake создан',
    successBody: 'Запрос готов к проверке владельцем в workflow Marketing + Sales.',
    saved: 'Сохранено в очереди владельца',
    queued: 'Ожидает утверждения владельца',
    notSaved: 'Подготовлено, но ещё не сохранено в очереди владельца',
    missing: 'Заполните обязательные поля.',
    error: 'Не удалось создать этот запрос.',
    options: { website_optimizer: 'Website Optimizer', repo_check: 'Repo / Audit Check', cybersecurity_check: 'Cybersecurity Check', audit_preview: 'Audit Preview' },
  },
}

function activeLang(lang: string): Lang {
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
}

function sourceFromQuery(value: string | null): Source {
  return value === 'repo_check' || value === 'cybersecurity_check' || value === 'audit_preview' ? value : 'website_optimizer'
}

function toCosLocale(lang: Lang) { return lang === 'pt' ? 'pt-BR' : lang }

export default function RequestPlanPage() {
  const { lang } = useI18n()
  const langCode = activeLang(lang)
  const copy = COPY[langCode]
  const [source, setSource] = useState<Source>('website_optimizer')
  const [targetUrl, setTargetUrl] = useState('')
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSource(sourceFromQuery(params.get('source')))
    const target = params.get('target')
    if (target) setTargetUrl(target)
  }, [])

  // The public tools are lead magnets: the request must reach the COS Marketing + Sales
  // engine as an owner-review record. Writing browser state alone loses the lead.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !targetUrl.trim()) { setError(copy.missing); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/public/lead-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, targetUrl, name, email, company, locale: toCosLocale(langCode), tags: ['public-lead-magnet'] }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.ok) { setError(typeof json?.error === 'string' ? json.error : copy.error); return }
      setResult(json.intake)
    } catch {
      setError(copy.error)
    } finally {
      setLoading(false)
    }
  }

  function continueToPlatform() {
    if (typeof window !== 'undefined') window.location.href = '/dashboard'
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

            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.targetUrl}</span>
              <input value={targetUrl} onChange={event => setTargetUrl(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.company} <span className="font-normal text-slate-500">({copy.optional})</span></span>
              <input value={company} onChange={event => setCompany(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.name} <span className="font-normal text-slate-500">({copy.optional})</span></span>
              <input value={name} onChange={event => setName(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.email}</span>
              <input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" />
            </label>

            <p className="text-sm leading-6 text-slate-400">{copy.note}</p>

            {error ? <p className="rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{error}</p> : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">{loading ? copy.submitting : copy.submit}</button>
              <button type="button" onClick={continueToPlatform} className="rounded-xl border border-white/10 px-5 py-3 text-center font-black text-white transition hover:border-cyan-300/50 hover:text-cyan-100">{copy.continue}</button>
              <Link href="/pricing" className="rounded-xl border border-white/10 px-5 py-3 text-center font-black text-white transition hover:border-cyan-300/50 hover:text-cyan-100">{copy.pricing}</Link>
            </div>
          </form>

          {result ? (
            <section className="mt-8 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-6">
              <h2 className="text-2xl font-black text-white">{copy.successTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-cyan-50/80">{copy.successBody}</p>
              <p className="mt-4 text-sm font-bold text-cyan-100">{saved ? copy.saved : copy.notSaved}</p>
              <p className="mt-1 text-xs text-cyan-50/70">{copy.queued}</p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  )
}
