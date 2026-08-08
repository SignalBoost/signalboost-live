// saas/app/website-optimizer/page.tsx
'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText, WEBSITE_OPTIMIZER_REPORT_COPY } from '@/lib/i18n/uiText'

type Lang = 'en' | 'pt' | 'es' | 'pl' | 'ru'
type Finding = { code: string; category: 'performance' | 'seo' | 'accessibility' | 'security' | 'conversion'; severity: 'high' | 'medium' | 'low'; value?: string | number | boolean }

type Copy = {
  back: string; badge: string; title: string; subtitle: string; urlLabel: string; placeholder: string; scan: string; scanning: string; hint: string; trySample: string; missingUrl: string; scanFailed: string; ready: string; begin: string; score: string; loadTime: string; findings: string; high: string; medium: string; low: string; pageChecked: string; topFindings: string; noFindings: string; metrics: string; html: string; titleLength: string; descriptionLength: string; scripts: string; stylesheets: string; images: string; missingAlt: string; h1: string; lazyImages: string; requestTitle: string; requestBody: string; requestCta: string; safeNote: string; detailLabel: string; fixLabel: string; genericFinding: string; genericDetail: (category: string, value?: string | number | boolean) => string; fixes: Record<string, string>; categories: Record<string, string>; severities: Record<string, string>
}

const COPY: Record<Lang, Copy> = {
  en: {
    back: uiText('generatedUi.u_85647deec9865df5'), badge: uiText('generatedUi.u_a953ec3265030ca3'), title: uiText('generatedUi.u_44ff7cb3d8a65a00'), subtitle: uiText('generatedUi.u_3b80ab28989e0d21'), urlLabel: uiText('generatedUi.u_e9cb62d631733c50'), placeholder: uiText('generatedUi.u_100680ad546ce6a5'), scan: uiText('generatedUi.u_d3e491a08e9adf8b'), scanning: uiText('generatedUi.u_38d96da6e8b253d2'), hint: uiText('generatedUi.u_77073e6e91687e62'), trySample: uiText('generatedUi.u_470b58b8e271f524'), missingUrl: uiText('generatedUi.u_fae83b98fe90224a'), scanFailed: uiText('generatedUi.u_da02acc02eb77254'), ready: uiText('generatedUi.u_5fa7aac5375c5815'), begin: uiText('generatedUi.u_0bdbfa75aa2b32eb'), score: uiText('generatedUi.u_38e5a46cbc5ad328'), loadTime: uiText('generatedUi.u_2e8cbe13da056dad'), findings: uiText('generatedUi.u_e171c2ff25b55e5a'), high: uiText('generatedUi.u_c4ebc6d4a5832cd9'), pageChecked: uiText('generatedUi.u_311dd8c115a97a36'), topFindings: uiText('generatedUi.u_3b2fe8dcdb6bcf6e'), noFindings: uiText('generatedUi.u_f2d17ce6528e5523'), requestTitle: uiText('generatedUi.u_ee9f27236ed19a6c'), requestBody: uiText('generatedUi.u_f8dfe0406d9bce6c'), requestCta: uiText('generatedUi.u_25957a57952f7e25'), safeNote: uiText('generatedUi.u_a6620c323f961c7d'), ...WEBSITE_OPTIMIZER_REPORT_COPY.en, categories: { performance: uiText('generatedUi.u_442aded87a55aa8c'), seo: uiText('generatedUi.u_6bc4718fbb156bc9'), accessibility: uiText('generatedUi.u_d3368cbffe23c98d'), security: uiText('generatedUi.u_8f6fb4eb7f42c0e2'), conversion: uiText('generatedUi.u_1f04a8531a463901') }, severities: { high: uiText('generatedUi.u_c4ebc6d4a5832cd9'), medium: uiText('generatedUi.u_8e588cd187741f1c'), low: uiText('generatedUi.u_f793de205ead5ac3') },
  },
  pt: {
    back: 'SignalBoost', badge: 'Utilitário gratuito para sites', title: 'Teste a otimização do seu site gratuitamente.', subtitle: 'Cole uma URL pública e receba uma prévia rápida de desempenho, SEO, acessibilidade, segurança e conversão.', urlLabel: 'URL pública do site', placeholder: 'https://exemplo.com', scan: 'Executar verificação grátis', scanning: 'Verificando…', hint: 'Apenas páginas públicas. Prévia de uma página. Sem acesso privado e sem mudanças automáticas.', trySample: 'Testar SignalBoost', missingUrl: 'Cole primeiro uma URL pública.', scanFailed: 'Não foi possível verificar este site.', ready: 'Pronto', begin: 'Cole uma URL para começar', score: 'Pontuação', loadTime: 'Tempo de carga', findings: 'Constatações', high: 'Alta', pageChecked: 'Página verificada', topFindings: 'Principais oportunidades de otimização', noFindings: 'Nenhum problema importante encontrado nesta prévia. Não é uma auditoria completa, mas é um bom primeiro sinal.', requestTitle: 'Solicitar plano de correção', requestBody: 'Envie este resultado ao motor COS Marketing + Vendas. Ele criará um lead com tags e preparará um follow-up aprovado pelo proprietário. Nada é enviado automaticamente.', requestCta: 'Solicitar plano de correção', safeNote: 'Nenhuma mudança ou follow-up acontece sem aprovação.', ...WEBSITE_OPTIMIZER_REPORT_COPY.pt, categories: { performance: 'Desempenho', seo: 'SEO', accessibility: 'Acessibilidade', security: 'Segurança', conversion: 'Conversão' }, severities: { high: 'Alta', medium: 'Média', low: 'Baixa' },
  },
  es: {
    back: 'SignalBoost', badge: 'Utilidad gratuita para sitios', title: 'Prueba gratis la optimización de tu sitio web.', subtitle: 'Pega una URL pública y recibe una vista previa rápida de rendimiento, SEO, accesibilidad, seguridad y conversión.', urlLabel: 'URL pública del sitio', placeholder: 'https://ejemplo.com', scan: 'Ejecutar revisión gratis', scanning: 'Revisando…', hint: 'Solo páginas públicas. Vista previa de una página. Sin acceso privado y sin cambios automáticos.', trySample: 'Probar SignalBoost', missingUrl: 'Pega primero una URL pública.', scanFailed: 'No se pudo revisar este sitio.', ready: 'Listo', begin: 'Pega una URL para comenzar', score: 'Puntuación', loadTime: 'Tiempo de carga', findings: 'Hallazgos', high: 'Alta', pageChecked: 'Página revisada', topFindings: 'Principales oportunidades de optimización', noFindings: 'No se encontraron problemas importantes en esta vista previa. No es una auditoría completa, pero es una buena primera señal.', requestTitle: 'Solicitar plan de corrección', requestBody: 'Envía este resultado al motor COS Marketing + Ventas. Creará un lead etiquetado y preparará un seguimiento aprobado por el propietario. Nada se envía automáticamente.', requestCta: 'Solicitar plan de corrección', safeNote: 'No hay cambios ni seguimiento sin aprobación.', ...WEBSITE_OPTIMIZER_REPORT_COPY.es, categories: { performance: 'Rendimiento', seo: 'SEO', accessibility: 'Accesibilidad', security: 'Seguridad', conversion: 'Conversión' }, severities: { high: 'Alta', medium: 'Media', low: 'Baja' },
  },
  pl: {
    back: 'SignalBoost', badge: 'Darmowe narzędzie dla stron', title: 'Sprawdź za darmo optymalizację swojej strony.', subtitle: 'Wklej publiczny URL i otrzymaj szybki podgląd wydajności, SEO, dostępności, bezpieczeństwa i konwersji.', urlLabel: 'Publiczny URL strony', placeholder: 'https://example.com', scan: 'Uruchom darmowe sprawdzenie', scanning: 'Skanowanie…', hint: 'Tylko publiczne strony. Podgląd jednej strony. Bez prywatnego dostępu i automatycznych zmian.', trySample: 'Sprawdź SignalBoost', missingUrl: 'Najpierw wklej publiczny URL.', scanFailed: 'Nie udało się sprawdzić tej strony.', ready: 'Gotowe', begin: 'Wklej URL, aby zacząć', score: 'Wynik', loadTime: 'Czas ładowania', findings: 'Wyniki', high: 'Wysoka', pageChecked: 'Sprawdzona strona', topFindings: 'Najważniejsze możliwości optymalizacji', noFindings: 'Nie znaleziono dużych problemów w tym podglądzie. To nie jest pełny audyt, ale dobry pierwszy sygnał.', requestTitle: 'Poproś o plan poprawek', requestBody: 'Wyślij ten wynik do silnika COS Marketing + Sprzedaż. Utworzy otagowanego leada i przygotuje follow-up do akceptacji właściciela. Nic nie wysyła się automatycznie.', requestCta: 'Poproś o plan poprawek', safeNote: 'Bez zmian i follow-up bez akceptacji.', ...WEBSITE_OPTIMIZER_REPORT_COPY.pl, categories: { performance: 'Wydajność', seo: 'SEO', accessibility: 'Dostępność', security: 'Bezpieczeństwo', conversion: 'Konwersja' }, severities: { high: 'Wysoka', medium: 'Średnia', low: 'Niska' },
  },
  ru: {
    back: 'SignalBoost', badge: 'Бесплатный инструмент для сайтов', title: 'Бесплатно проверьте оптимизацию своего сайта.', subtitle: 'Вставьте публичный URL и получите быстрый обзор производительности, SEO, доступности, безопасности и конверсии.', urlLabel: 'Публичный URL сайта', placeholder: 'https://example.com', scan: 'Запустить бесплатную проверку', scanning: 'Проверка…', hint: 'Только публичные страницы. Обзор одной страницы. Без приватного доступа и автоматических изменений.', trySample: 'Проверить SignalBoost', missingUrl: 'Сначала вставьте публичный URL.', scanFailed: 'Не удалось проверить этот сайт.', ready: 'Готово', begin: 'Вставьте URL, чтобы начать', score: 'Оценка', loadTime: 'Время загрузки', findings: 'Замечания', high: 'Высокая', pageChecked: 'Проверенная страница', topFindings: 'Главные возможности оптимизации', noFindings: 'В этом обзоре не найдено серьёзных проблем. Это не полный аудит, но хороший первый сигнал.', requestTitle: 'Запросить план исправлений', requestBody: 'Отправьте этот результат в COS Marketing + Sales engine. Он создаст tagged lead и подготовит follow-up для утверждения владельцем. Ничего не отправляется автоматически.', requestCta: 'Запросить план исправлений', safeNote: 'Без изменений и follow-up без утверждения.', ...WEBSITE_OPTIMIZER_REPORT_COPY.ru, categories: { performance: 'Производительность', seo: 'SEO', accessibility: 'Доступность', security: 'Безопасность', conversion: 'Конверсия' }, severities: { high: 'Высокая', medium: 'Средняя', low: 'Низкая' },
  },
}

const SEVERITY_STYLES: Record<string, string> = { high: 'border-red-400/40 bg-red-400/10 text-red-100', medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100', low: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' }
function activeLang(lang: string): Lang { return (['en', 'pt', 'es', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang }
function formatMs(ms?: number) { return !ms ? '0 ms' : ms > 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms` }
function formatBytes(bytes?: number) { return !bytes ? '0 KB' : `${Math.max(1, Math.round(bytes / 1024))} KB` }
function planHref(target: string) { return `/request-plan?source=website_optimizer&target=${encodeURIComponent(target)}` }

export default function WebsiteOptimizerPage() {
  const { lang } = useI18n()
  const copy = COPY[activeLang(lang)]
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<any>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!url.trim()) { setError(copy.missingUrl); return }
    setLoading(true); setError(''); setData(null)
    try {
      const res = await fetch('/api/public/site-optimization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(typeof json?.error === 'string' ? json.error : copy.scanFailed); return }
      setData(json)
      window.localStorage.setItem('signalboost.concierge.utilityContext', JSON.stringify({ source: 'website_optimizer', target: json.finalUrl || json.target || url.trim(), report: `Free Website Optimizer report for ${json.finalUrl || json.target || url.trim()}: score ${json.summary?.score ?? 'n/a'}, findings ${json.summary?.findings ?? 'n/a'}, high ${json.summary?.high ?? 'n/a'}. Top opportunities: ${(json.findings || []).slice(0, 5).map((f: any) => f.code).join(', ') || 'none flagged'}.` }))
      window.dispatchEvent(new Event('signalboost:concierge-utility-context'))
    } catch { setError(copy.scanFailed) } finally { setLoading(false) }
  }

  const summary = data?.summary || null
  const findings: Finding[] = Array.isArray(data?.findings) ? data.findings : []
  const metrics = data?.metrics || {}
  const target = String(data?.finalUrl || data?.target || url || '')
  const headlineRows = useMemo(() => ([
    [copy.score, summary?.score ?? '—'], [copy.loadTime, summary ? formatMs(summary.loadMs) : '—'], [copy.findings, summary?.findings ?? '—'], [copy.high, summary?.high ?? '—'],
  ]), [copy, summary])
  const reportRows = useMemo(() => ([
    [copy.html, summary ? formatBytes(summary.htmlBytes) : '—'],
    [copy.medium, summary?.medium ?? '—'],
    [copy.low, summary?.low ?? '—'],
    [copy.titleLength, metrics.titleLength ?? '—'],
    [copy.descriptionLength, metrics.descriptionLength ?? '—'],
    [copy.scripts, metrics.scriptCount ?? '—'],
    [copy.stylesheets, metrics.stylesheetCount ?? '—'],
    [copy.images, metrics.imageCount ?? '—'],
    [copy.missingAlt, metrics.imagesWithoutAlt ?? '—'],
    [copy.h1, metrics.h1Count ?? '—'],
    [copy.lazyImages, metrics.lazyImages ?? '—'],
  ]), [copy, metrics, summary])

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm font-semibold text-cyan-200 hover:text-white">← {copy.back}</Link>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-cyan-950/30">
            <span className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">{copy.badge}</span>
            <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">{copy.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{copy.subtitle}</p>
            <form onSubmit={submit} className="mt-8 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <label className="text-sm font-bold text-slate-200" htmlFor="website-url">{copy.urlLabel}</label>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input id="website-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder={copy.placeholder} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" />
                <button type="submit" disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 hover:bg-white disabled:opacity-60">{loading ? copy.scanning : copy.scan}</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400"><span>{copy.hint}</span><button type="button" onClick={() => setUrl('https://saas.signalboostapp.com')} className="font-bold text-cyan-200 hover:text-white">{copy.trySample}</button></div>
            </form>
            {error && <div className="mt-4 rounded-xl border border-red-300/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{error}</div>}
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <span className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{data ? copy.ready : copy.begin}</span>
            <div className="mt-6 grid grid-cols-2 gap-3">{headlineRows.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p><strong className="mt-2 block text-3xl text-cyan-100">{String(value)}</strong></div>)}</div>
          </aside>
        </div>

        {data && <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.42fr]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">{copy.pageChecked}</p>
            <h2 className="mt-2 break-all text-xl font-black">{target}</h2>
            <h3 className="mb-4 mt-6 text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.topFindings}</h3>
            {findings.length === 0 ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-emerald-100">{copy.noFindings}</p> : <div className="grid gap-4">{findings.map((finding, index) => {
              const category = copy.categories[finding.category] || finding.category
              return <article key={`${finding.code}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.low}`}>{copy.severities[finding.severity] || finding.severity}</span><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-300">{category}</span></div>
                <h4 className="mt-3 text-lg font-black">{copy.genericFinding}</h4>
                <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{copy.detailLabel}</p>
                <p className="mt-1 text-sm leading-6 text-slate-300">{copy.genericDetail(category, finding.value)}</p>
                <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-200">{copy.fixLabel}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-cyan-100">{copy.fixes[finding.category]}</p>
              </article>
            })}</div>}
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.metrics}</h3>
              <div className="mt-4 grid gap-3 text-sm">{reportRows.map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4 border-b border-white/5 pb-2 text-slate-300 last:border-0"><span>{label}</span><strong className="text-white">{String(value)}</strong></div>)}</div>
            </section>
            <section className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-6"><h3 className="text-2xl font-black">{copy.requestTitle}</h3><p className="mt-3 text-sm leading-6 text-cyan-50/80">{copy.requestBody}</p><Link href={planHref(target)} className="mt-6 inline-flex w-full justify-center rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-slate-950 hover:bg-white">{copy.requestCta}</Link><p className="mt-3 text-center text-xs text-cyan-50/70">{copy.safeNote}</p></section>
          </aside>
        </div>}
      </section>
    </main>
  )
}
