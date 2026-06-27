'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

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
  options: Record<Source, string>
}

const COPY: Record<Lang, Copy> = {
  en: {
    back: 'SignalBoost',
    badge: 'Next step',
    title: 'Continue in SignalBoost to fix this.',
    body: 'The free public tool already showed the signal. To get the issue fixed or turned into a full improvement workflow, continue to SignalBoost and sign up like any other customer.',
    safe: 'No automatic email, no hidden follow-up, and no changes without approval.',
    source: 'Tool used',
    targetUrl: 'Website or repo checked',
    company: 'Company',
    optional: 'optional',
    continue: 'Continue to SignalBoost',
    pricing: 'View pricing',
    note: 'Company information is optional. It only helps keep the context clear when you continue.',
    options: { website_optimizer: 'Website Optimizer', repo_check: 'Repo / Audit Check', cybersecurity_check: 'Cybersecurity Check', audit_preview: 'Audit Preview' },
  },
  es: {
    back: 'SignalBoost',
    badge: 'Siguiente paso',
    title: 'Continúa en SignalBoost para corregir esto.',
    body: 'La herramienta pública gratuita ya mostró la señal. Para corregir el problema o convertirlo en un flujo completo de mejora, continúa a SignalBoost y regístrate como cualquier otro cliente.',
    safe: 'Sin email automático, sin seguimiento oculto y sin cambios sin aprobación.',
    source: 'Herramienta usada',
    targetUrl: 'Sitio o repo revisado',
    company: 'Empresa',
    optional: 'opcional',
    continue: 'Continuar a SignalBoost',
    pricing: 'Ver precios',
    note: 'La información de la empresa es opcional. Solo ayuda a mantener claro el contexto al continuar.',
    options: { website_optimizer: 'Optimizador Web', repo_check: 'Repo / Auditoría', cybersecurity_check: 'Revisión de Ciberseguridad', audit_preview: 'Vista de Auditoría' },
  },
  pt: {
    back: 'SignalBoost',
    badge: 'Próximo passo',
    title: 'Continue no SignalBoost para corrigir isso.',
    body: 'A ferramenta pública gratuita já mostrou o sinal. Para corrigir o problema ou transformá-lo em um fluxo completo de melhoria, continue para o SignalBoost e cadastre-se como qualquer outro cliente.',
    safe: 'Sem email automático, sem follow-up oculto e sem mudanças sem aprovação.',
    source: 'Ferramenta usada',
    targetUrl: 'Site ou repo verificado',
    company: 'Empresa',
    optional: 'opcional',
    continue: 'Continuar para o SignalBoost',
    pricing: 'Ver preços',
    note: 'A informação da empresa é opcional. Ela apenas ajuda a manter o contexto claro ao continuar.',
    options: { website_optimizer: 'Otimizador de Site', repo_check: 'Repo / Auditoria', cybersecurity_check: 'Verificação de Cibersegurança', audit_preview: 'Prévia de Auditoria' },
  },
  pl: {
    back: 'SignalBoost',
    badge: 'Następny krok',
    title: 'Kontynuuj w SignalBoost, aby to naprawić.',
    body: 'Darmowe publiczne narzędzie pokazało już sygnał. Aby naprawić problem albo zmienić go w pełny workflow ulepszeń, przejdź do SignalBoost i zarejestruj się jak każdy klient.',
    safe: 'Bez automatycznego emaila, ukrytego follow-up i zmian bez akceptacji.',
    source: 'Użyte narzędzie',
    targetUrl: 'Sprawdzona strona lub repo',
    company: 'Firma',
    optional: 'opcjonalnie',
    continue: 'Kontynuuj do SignalBoost',
    pricing: 'Zobacz ceny',
    note: 'Informacja o firmie jest opcjonalna. Pomaga tylko zachować jasny kontekst po przejściu dalej.',
    options: { website_optimizer: 'Optymalizator Strony', repo_check: 'Repo / Audyt', cybersecurity_check: 'Test Cyberbezpieczeństwa', audit_preview: 'Podgląd Audytu' },
  },
  ru: {
    back: 'SignalBoost',
    badge: 'Следующий шаг',
    title: 'Продолжите в SignalBoost, чтобы это исправить.',
    body: 'Бесплатный публичный инструмент уже показал сигнал. Чтобы исправить проблему или превратить её в полный workflow улучшений, перейдите в SignalBoost и зарегистрируйтесь как обычный клиент.',
    safe: 'Без автоматического email, скрытого follow-up и изменений без утверждения.',
    source: 'Использованный инструмент',
    targetUrl: 'Проверенный сайт или repo',
    company: 'Компания',
    optional: 'необязательно',
    continue: 'Продолжить в SignalBoost',
    pricing: 'Посмотреть цены',
    note: 'Информация о компании необязательна. Она только помогает сохранить контекст при продолжении.',
    options: { website_optimizer: 'Website Optimizer', repo_check: 'Repo / Audit Check', cybersecurity_check: 'Cybersecurity Check', audit_preview: 'Audit Preview' },
  },
}

function activeLang(lang: string): Lang {
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
}

function sourceFromQuery(value: string | null): Source {
  return value === 'repo_check' || value === 'cybersecurity_check' || value === 'audit_preview' ? value : 'website_optimizer'
}

export default function RequestPlanPage() {
  const { lang } = useI18n()
  const copy = COPY[activeLang(lang)]
  const [source, setSource] = useState<Source>('website_optimizer')
  const [targetUrl, setTargetUrl] = useState('')
  const [company, setCompany] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSource(sourceFromQuery(params.get('source')))
    const target = params.get('target')
    if (target) setTargetUrl(target)
  }, [])

  function continueToSignalBoost() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('signalboost_public_tool_context', JSON.stringify({
        source,
        targetUrl,
        company: company.trim() || null,
        capturedAt: new Date().toISOString(),
      }))
      window.location.href = '/dashboard'
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-semibold text-cyan-200 hover:text-white">← {copy.back}</Link>
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-cyan-950/30">
          <span className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">{copy.badge}</span>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-white md:text-5xl">{copy.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{copy.body}</p>
          <p className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-50">{copy.safe}</p>

          <div className="mt-8 grid gap-4">
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

            <p className="text-sm leading-6 text-slate-400">{copy.note}</p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={continueToSignalBoost} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-white">{copy.continue}</button>
              <Link href="/pricing" className="rounded-xl border border-white/10 px-5 py-3 text-center font-black text-white transition hover:border-cyan-300/50 hover:text-cyan-100">{copy.pricing}</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
