'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Finding = {
  code: string
  category: 'performance' | 'seo' | 'accessibility' | 'security' | 'conversion'
  severity: 'high' | 'medium' | 'low'
  value?: string | number | boolean
}

type PageCopy = {
  back: string
  badge: string
  title: string
  subtitle: string
  urlLabel: string
  placeholder: string
  scan: string
  scanning: string
  hint: string
  trySample: string
  missingUrl: string
  scanFailed: string
  liveCheck: string
  begin: string
  ready: string
  score: string
  loadTime: string
  findings: string
  high: string
  medium: string
  low: string
  topFindings: string
  pageChecked: string
  category: string
  severity: string
  metrics: string
  titleLength: string
  descriptionLength: string
  scripts: string
  stylesheets: string
  images: string
  missingAlt: string
  h1: string
  noFindings: string
  unlockTitle: string
  unlockBody: string
  unlock1: string
  unlock2: string
  unlock3: string
  unlock4: string
  unlockCta: string
  safeNote: string
  steps: string[]
  categories: Record<string, string>
  severities: Record<string, string>
  findingText: Record<string, { title: string; detail: (v?: string | number | boolean) => string; fix: string }>
}

const COPY: Record<string, PageCopy> = {
  en: {
    back: 'SignalBoost', badge: 'Free website utility', title: 'Test your website optimization for free.', subtitle: 'Paste a public website URL and get a quick preview of performance, SEO, accessibility, security, and conversion opportunities. The free scan shows the signal; SignalBoost can help prepare the owner-approved fix plan.', urlLabel: 'Public website URL', placeholder: 'https://example.com', scan: 'Run free optimization scan', scanning: 'Scanning…', hint: 'Public pages only. One-page preview. No private access and no automatic changes.', trySample: 'Try SignalBoost', missingUrl: 'Paste a public website URL first.', scanFailed: 'Could not scan this website.', liveCheck: 'Live optimization check', begin: 'Paste a website URL to begin', ready: 'Ready', score: 'Score', loadTime: 'Load time', findings: 'Findings', high: 'High', medium: 'Medium', low: 'Low', topFindings: 'Top optimization opportunities', pageChecked: 'Page checked', category: 'Category', severity: 'Severity', metrics: 'Page metrics', titleLength: 'Title length', descriptionLength: 'Description length', scripts: 'Scripts', stylesheets: 'Stylesheets', images: 'Images', missingAlt: 'Images missing alt', h1: 'H1 count', noFindings: 'No major issues found in this one-page preview. This is not a full optimization audit, but it is a good first signal.', unlockTitle: 'Let SignalBoost fix the opportunities', unlockBody: 'Optimization Pro can turn these findings into a human-approved improvement plan for speed, SEO, accessibility, security, conversion, and content.', unlock1: 'Full site optimization audit', unlock2: 'Owner-approved fix plan', unlock3: 'SEO and conversion copy improvements', unlock4: 'Website rebuild or targeted fixes', unlockCta: 'Ask SignalBoost to fix this', safeNote: 'No changes happen without your approval.', steps: ['Loading public page', 'Checking optimization signals', 'Preparing summary'], categories: { performance: 'Performance', seo: 'SEO', accessibility: 'Accessibility', security: 'Security', conversion: 'Conversion' }, severities: { high: 'High', medium: 'Medium', low: 'Low' }, findingText: {
      slow_response: { title: 'Slow server response', detail: v => `The page took about ${v} ms to respond.`, fix: 'Review hosting, caching, server rendering, and heavy third-party scripts.' },
      moderate_response: { title: 'Moderate response time', detail: v => `The page took about ${v} ms to respond.`, fix: 'Improve caching and reduce server-side work before the page loads.' },
      large_html: { title: 'Large HTML payload', detail: v => `The page HTML preview is about ${Math.round(Number(v || 0) / 1024)} KB.`, fix: 'Reduce unused markup, inline data, and heavy page content.' },
      many_scripts: { title: 'Many scripts detected', detail: v => `${v} script tags were found.`, fix: 'Remove unused scripts and defer non-critical JavaScript.' },
      many_stylesheets: { title: 'Many stylesheets detected', detail: v => `${v} stylesheets were found.`, fix: 'Consolidate critical CSS and remove unused styles.' },
      missing_lazy_images: { title: 'Images may not be lazy-loaded', detail: v => `${v} images were found with no lazy-loading signal.`, fix: 'Add lazy loading for below-the-fold images.' },
      missing_compression: { title: 'Compression header not detected', detail: () => 'The response did not show gzip, Brotli, or zstd compression.', fix: 'Enable compression on your hosting/CDN.' },
      missing_cache_header: { title: 'Cache policy not detected', detail: () => 'No Cache-Control header was detected.', fix: 'Set caching rules for static and public assets.' },
      missing_title: { title: 'Missing page title', detail: () => 'The page does not expose a visible HTML title tag.', fix: 'Add a clear SEO title focused on the main offer.' },
      title_length: { title: 'Title length needs review', detail: v => `The title is ${v} characters.`, fix: 'Keep titles clear, specific, and usually between 25 and 70 characters.' },
      missing_description: { title: 'Missing meta description', detail: () => 'The page does not expose a meta description.', fix: 'Add a benefit-focused description for search and previews.' },
      description_length: { title: 'Meta description length needs review', detail: v => `The description is ${v} characters.`, fix: 'Keep descriptions useful and usually between 80 and 170 characters.' },
      missing_viewport: { title: 'Missing mobile viewport', detail: () => 'No viewport meta tag was detected.', fix: 'Add a responsive viewport tag for mobile browsers.' },
      missing_canonical: { title: 'Canonical URL not detected', detail: () => 'No canonical link was found.', fix: 'Add a canonical URL to reduce duplicate-page confusion.' },
      h1_count: { title: 'H1 structure needs review', detail: v => `The scan found ${v} H1 tags.`, fix: 'Use one clear H1 that matches the main page promise.' },
      robots_noindex: { title: 'Page is marked noindex', detail: () => 'The page appears to tell search engines not to index it.', fix: 'Remove noindex if this page should appear in search results.' },
      missing_social_meta: { title: 'Social sharing metadata incomplete', detail: () => 'Open Graph title or description was not detected.', fix: 'Add Open Graph metadata for better LinkedIn/Facebook/social previews.' },
      images_missing_alt: { title: 'Images missing alt text', detail: v => `${v} image tags appear to be missing alt text.`, fix: 'Add helpful alt text for meaningful images.' },
      missing_html_lang: { title: 'Missing page language', detail: () => 'The html lang attribute was not detected.', fix: 'Add the page language for accessibility and translation tools.' },
      not_https: { title: 'HTTPS not used', detail: () => 'The submitted URL is not using HTTPS.', fix: 'Use HTTPS for trust, SEO, and browser security.' },
      missing_csp: { title: 'Content Security Policy not detected', detail: () => 'No CSP header was detected.', fix: 'Add a CSP to reduce script and injection risk.' },
      missing_hsts: { title: 'HSTS not detected', detail: () => 'No Strict-Transport-Security header was detected.', fix: 'Enable HSTS after confirming HTTPS is stable.' },
      missing_nosniff: { title: 'nosniff header not detected', detail: () => 'The X-Content-Type-Options nosniff header was not detected.', fix: 'Add nosniff to reduce content-type confusion risk.' },
      missing_cta: { title: 'Clear conversion action not detected', detail: () => 'The preview did not detect a form or common call-to-action link.', fix: 'Add a clear next step such as booking, signup, pricing, quote, or demo.' },
    },
  },
  pt: {
    back: 'SignalBoost', badge: 'Utilitário gratuito para sites', title: 'Teste a otimização do seu site gratuitamente.', subtitle: 'Cole a URL pública de um site e receba uma prévia rápida de oportunidades de desempenho, SEO, acessibilidade, segurança e conversão. A verificação gratuita mostra o sinal; o SignalBoost pode ajudar a preparar o plano de correção aprovado pelo proprietário.', urlLabel: 'URL pública do site', placeholder: 'https://exemplo.com', scan: 'Executar verificação grátis', scanning: 'Verificando…', hint: 'Apenas páginas públicas. Prévia de uma página. Sem acesso privado e sem mudanças automáticas.', trySample: 'Testar SignalBoost', missingUrl: 'Cole primeiro uma URL pública de site.', scanFailed: 'Não foi possível verificar este site.', liveCheck: 'Verificação de otimização ao vivo', begin: 'Cole uma URL para começar', ready: 'Pronto', score: 'Pontuação', loadTime: 'Tempo de carga', findings: 'Constatações', high: 'Alta', medium: 'Média', low: 'Baixa', topFindings: 'Principais oportunidades de otimização', pageChecked: 'Página verificada', category: 'Categoria', severity: 'Severidade', metrics: 'Métricas da página', titleLength: 'Tamanho do título', descriptionLength: 'Tamanho da descrição', scripts: 'Scripts', stylesheets: 'Folhas de estilo', images: 'Imagens', missingAlt: 'Imagens sem alt', h1: 'Quantidade de H1', noFindings: 'Nenhum problema importante encontrado nesta prévia de uma página. Isto não é uma auditoria completa, mas é um bom primeiro sinal.', unlockTitle: 'Deixe o SignalBoost corrigir as oportunidades', unlockBody: 'Optimization Pro pode transformar estas constatações em um plano de melhoria aprovado por humano para velocidade, SEO, acessibilidade, segurança, conversão e conteúdo.', unlock1: 'Auditoria completa de otimização do site', unlock2: 'Plano de correção aprovado pelo proprietário', unlock3: 'Melhorias de SEO e conversão', unlock4: 'Reconstrução do site ou correções direcionadas', unlockCta: 'Pedir ao SignalBoost para corrigir', safeNote: 'Nenhuma mudança acontece sem sua aprovação.', steps: ['Carregando página pública', 'Verificando sinais de otimização', 'Preparando resumo'], categories: { performance: 'Desempenho', seo: 'SEO', accessibility: 'Acessibilidade', security: 'Segurança', conversion: 'Conversão' }, severities: { high: 'Alta', medium: 'Média', low: 'Baixa' }, findingText: {},
  },
  es: {
    back: 'SignalBoost', badge: 'Utilidad gratuita para sitios', title: 'Prueba gratis la optimización de tu sitio web.', subtitle: 'Pega la URL pública de un sitio y recibe una vista previa rápida de oportunidades de rendimiento, SEO, accesibilidad, seguridad y conversión. La revisión gratuita muestra la señal; SignalBoost puede ayudar a preparar el plan de corrección con aprobación del propietario.', urlLabel: 'URL pública del sitio', placeholder: 'https://ejemplo.com', scan: 'Ejecutar revisión gratis', scanning: 'Revisando…', hint: 'Solo páginas públicas. Vista previa de una página. Sin acceso privado y sin cambios automáticos.', trySample: 'Probar SignalBoost', missingUrl: 'Pega primero una URL pública de sitio web.', scanFailed: 'No se pudo revisar este sitio.', liveCheck: 'Revisión de optimización en vivo', begin: 'Pega una URL para comenzar', ready: 'Listo', score: 'Puntuación', loadTime: 'Tiempo de carga', findings: 'Hallazgos', high: 'Alta', medium: 'Media', low: 'Baja', topFindings: 'Principales oportunidades de optimización', pageChecked: 'Página revisada', category: 'Categoría', severity: 'Severidad', metrics: 'Métricas de la página', titleLength: 'Longitud del título', descriptionLength: 'Longitud de la descripción', scripts: 'Scripts', stylesheets: 'Hojas de estilo', images: 'Imágenes', missingAlt: 'Imágenes sin alt', h1: 'Cantidad de H1', noFindings: 'No se encontraron problemas importantes en esta vista previa de una página. No es una auditoría completa, pero es una buena primera señal.', unlockTitle: 'Deja que SignalBoost corrija las oportunidades', unlockBody: 'Optimization Pro puede convertir estos hallazgos en un plan de mejora aprobado por humanos para velocidad, SEO, accesibilidad, seguridad, conversión y contenido.', unlock1: 'Auditoría completa de optimización del sitio', unlock2: 'Plan de corrección aprobado por el propietario', unlock3: 'Mejoras de SEO y conversión', unlock4: 'Reconstrucción del sitio o correcciones específicas', unlockCta: 'Pedir a SignalBoost que lo corrija', safeNote: 'No ocurre ningún cambio sin tu aprobación.', steps: ['Cargando página pública', 'Revisando señales de optimización', 'Preparando resumen'], categories: { performance: 'Rendimiento', seo: 'SEO', accessibility: 'Accesibilidad', security: 'Seguridad', conversion: 'Conversión' }, severities: { high: 'Alta', medium: 'Media', low: 'Baja' }, findingText: {},
  },
  pl: {
    back: 'SignalBoost', badge: 'Darmowe narzędzie dla stron', title: 'Sprawdź za darmo optymalizację swojej strony.', subtitle: 'Wklej publiczny URL strony i otrzymaj szybki podgląd możliwości poprawy wydajności, SEO, dostępności, bezpieczeństwa i konwersji. Darmowe sprawdzenie pokazuje sygnał; SignalBoost może pomóc przygotować plan poprawek zatwierdzany przez właściciela.', urlLabel: 'Publiczny URL strony', placeholder: 'https://example.com', scan: 'Uruchom darmowe sprawdzenie', scanning: 'Skanowanie…', hint: 'Tylko publiczne strony. Podgląd jednej strony. Bez prywatnego dostępu i bez automatycznych zmian.', trySample: 'Sprawdź SignalBoost', missingUrl: 'Najpierw wklej publiczny URL strony.', scanFailed: 'Nie udało się sprawdzić tej strony.', liveCheck: 'Sprawdzenie optymalizacji na żywo', begin: 'Wklej URL strony, aby zacząć', ready: 'Gotowe', score: 'Wynik', loadTime: 'Czas ładowania', findings: 'Wyniki', high: 'Wysoka', medium: 'Średnia', low: 'Niska', topFindings: 'Najważniejsze możliwości optymalizacji', pageChecked: 'Sprawdzona strona', category: 'Kategoria', severity: 'Waga', metrics: 'Metryki strony', titleLength: 'Długość tytułu', descriptionLength: 'Długość opisu', scripts: 'Skrypty', stylesheets: 'Arkusze stylów', images: 'Obrazy', missingAlt: 'Obrazy bez alt', h1: 'Liczba H1', noFindings: 'W tym podglądzie jednej strony nie znaleziono dużych problemów. To nie jest pełny audyt, ale dobry pierwszy sygnał.', unlockTitle: 'Pozwól SignalBoost poprawić te możliwości', unlockBody: 'Optimization Pro może zmienić te wyniki w plan ulepszeń zatwierdzany przez człowieka dla szybkości, SEO, dostępności, bezpieczeństwa, konwersji i treści.', unlock1: 'Pełny audyt optymalizacji strony', unlock2: 'Plan poprawek zatwierdzany przez właściciela', unlock3: 'Ulepszenia SEO i konwersji', unlock4: 'Przebudowa strony lub celowane poprawki', unlockCta: 'Poproś SignalBoost o poprawki', safeNote: 'Żadne zmiany nie następują bez Twojej zgody.', steps: ['Ładowanie publicznej strony', 'Sprawdzanie sygnałów optymalizacji', 'Przygotowywanie podsumowania'], categories: { performance: 'Wydajność', seo: 'SEO', accessibility: 'Dostępność', security: 'Bezpieczeństwo', conversion: 'Konwersja' }, severities: { high: 'Wysoka', medium: 'Średnia', low: 'Niska' }, findingText: {},
  },
  ru: {
    back: 'SignalBoost', badge: 'Бесплатный инструмент для сайтов', title: 'Бесплатно проверьте оптимизацию своего сайта.', subtitle: 'Вставьте публичный URL сайта и получите быстрый обзор возможностей улучшения скорости, SEO, доступности, безопасности и конверсии. Бесплатная проверка показывает сигнал; SignalBoost может помочь подготовить план исправлений с утверждением владельца.', urlLabel: 'Публичный URL сайта', placeholder: 'https://example.com', scan: 'Запустить бесплатную проверку', scanning: 'Проверка…', hint: 'Только публичные страницы. Обзор одной страницы. Без приватного доступа и без автоматических изменений.', trySample: 'Проверить SignalBoost', missingUrl: 'Сначала вставьте публичный URL сайта.', scanFailed: 'Не удалось проверить этот сайт.', liveCheck: 'Проверка оптимизации в реальном времени', begin: 'Вставьте URL сайта, чтобы начать', ready: 'Готово', score: 'Оценка', loadTime: 'Время загрузки', findings: 'Замечания', high: 'Высокая', medium: 'Средняя', low: 'Низкая', topFindings: 'Главные возможности оптимизации', pageChecked: 'Проверенная страница', category: 'Категория', severity: 'Важность', metrics: 'Метрики страницы', titleLength: 'Длина заголовка', descriptionLength: 'Длина описания', scripts: 'Скрипты', stylesheets: 'Стили', images: 'Изображения', missingAlt: 'Изображения без alt', h1: 'Количество H1', noFindings: 'В этом обзоре одной страницы не найдено серьёзных проблем. Это не полный аудит, но хороший первый сигнал.', unlockTitle: 'Позвольте SignalBoost исправить возможности', unlockBody: 'Optimization Pro может превратить эти замечания в план улучшений с человеческим утверждением для скорости, SEO, доступности, безопасности, конверсии и контента.', unlock1: 'Полный аудит оптимизации сайта', unlock2: 'План исправлений с утверждением владельца', unlock3: 'Улучшения SEO и конверсии', unlock4: 'Перестройка сайта или точечные исправления', unlockCta: 'Попросить SignalBoost исправить', safeNote: 'Никакие изменения не выполняются без вашего утверждения.', steps: ['Загрузка публичной страницы', 'Проверка сигналов оптимизации', 'Подготовка резюме'], categories: { performance: 'Производительность', seo: 'SEO', accessibility: 'Доступность', security: 'Безопасность', conversion: 'Конверсия' }, severities: { high: 'Высокая', medium: 'Средняя', low: 'Низкая' }, findingText: {},
  },
}

const SEVERITY_STYLES: Record<string, string> = { high: 'border-red-400/40 bg-red-400/10 text-red-100', medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100', low: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' }

function copyFor(lang: string): PageCopy {
  const base = COPY[lang] || COPY.en
  return base.findingText && Object.keys(base.findingText).length ? base : { ...base, findingText: COPY.en.findingText }
}

function formatBytes(bytes?: number) {
  if (!bytes) return '0 KB'
  return `${Math.round(bytes / 1024)} KB`
}

function formatMs(ms?: number) {
  if (!ms) return '0 ms'
  return ms > 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`
}

export default function WebsiteOptimizerPage() {
  const { lang } = useI18n()
  const copy = copyFor(lang)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState('')
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (!loading) return
    const timers = [window.setTimeout(() => setStage(1), 500), window.setTimeout(() => setStage(2), 1100)]
    return () => timers.forEach(window.clearTimeout)
  }, [loading])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!url.trim()) { setError(copy.missingUrl); return }
    setLoading(true); setStage(0); setError(''); setData(null)
    try {
      const res = await fetch('/api/public/site-optimization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || copy.scanFailed); return }
      setStage(2); setData(json)
    } catch { setError(copy.scanFailed) } finally { setLoading(false) }
  }

  const findings: Finding[] = Array.isArray(data?.findings) ? data.findings : []
  const summary = data?.summary || null
  const metrics = data?.metrics || {}
  const status = loading ? copy.steps[stage] : data ? copy.ready : copy.begin
  const metricRows = useMemo(() => [
    [copy.titleLength, metrics.titleLength ?? 0],
    [copy.descriptionLength, metrics.descriptionLength ?? 0],
    [copy.scripts, metrics.scriptCount ?? 0],
    [copy.stylesheets, metrics.stylesheetCount ?? 0],
    [copy.images, metrics.imageCount ?? 0],
    [copy.missingAlt, metrics.imagesWithoutAlt ?? 0],
    [copy.h1, metrics.h1Count ?? 0],
  ], [copy, metrics])

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm font-semibold text-cyan-200 hover:text-white">← {copy.back}</Link>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-start">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-cyan-950/30">
            <span className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">{copy.badge}</span>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-white md:text-6xl">{copy.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{copy.subtitle}</p>
            <form onSubmit={submit} className="mt-8 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <label className="text-sm font-bold text-slate-200" htmlFor="website-url">{copy.urlLabel}</label>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input id="website-url" value={url} onChange={event => setUrl(event.target.value)} placeholder={copy.placeholder} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" />
                <button type="submit" disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">{loading ? copy.scanning : copy.scan}</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>{copy.hint}</span>
                <button type="button" onClick={() => setUrl('https://saas.signalboostapp.com')} className="font-bold text-cyan-200 hover:text-white">{copy.trySample}</button>
              </div>
            </form>
            {error && <div className="mt-4 rounded-xl border border-red-300/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{error}</div>}
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.liveCheck}</span>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">{status}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">{copy.score}</p><strong className="mt-2 block text-3xl text-cyan-100">{summary ? summary.score : '—'}</strong></div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">{copy.loadTime}</p><strong className="mt-2 block text-3xl text-cyan-100">{summary ? formatMs(summary.loadMs) : '—'}</strong></div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">{copy.findings}</p><strong className="mt-2 block text-3xl text-cyan-100">{summary ? summary.findings : '—'}</strong></div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">{copy.high}</p><strong className="mt-2 block text-3xl text-red-100">{summary ? summary.high : '—'}</strong></div>
            </div>
          </aside>
        </div>

        {data && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.42fr]">
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">{copy.pageChecked}</p><h2 className="mt-2 text-xl font-black text-white break-all">{data.finalUrl || data.target}</h2></div>
              </div>
              <h3 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.topFindings}</h3>
              {findings.length === 0 ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-emerald-100">{copy.noFindings}</p> : (
                <div className="grid gap-4">
                  {findings.map((finding, index) => {
                    const text = copy.findingText[finding.code] || COPY.en.findingText[finding.code]
                    return (
                      <article key={`${finding.code}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.low}`}>{copy.severities[finding.severity] || finding.severity}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-300">{copy.categories[finding.category] || finding.category}</span>
                        </div>
                        <h4 className="mt-3 text-lg font-black text-white">{text?.title || finding.code}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{text?.detail ? text.detail(finding.value) : ''}</p>
                        <p className="mt-3 text-sm font-semibold text-cyan-100">{text?.fix}</p>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.metrics}</h3>
                <div className="mt-4 grid gap-3 text-sm">
                  <div className="flex justify-between gap-4 text-slate-300"><span>HTML</span><strong>{formatBytes(summary?.htmlBytes)}</strong></div>
                  {metricRows.map(([label, value]) => <div key={label} className="flex justify-between gap-4 text-slate-300"><span>{label}</span><strong>{value}</strong></div>)}
                </div>
              </section>

              <section className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-6">
                <h3 className="text-2xl font-black text-white">{copy.unlockTitle}</h3>
                <p className="mt-3 text-sm leading-6 text-cyan-50/80">{copy.unlockBody}</p>
                <ul className="mt-5 space-y-2 text-sm font-semibold text-cyan-50/90">
                  <li>✓ {copy.unlock1}</li><li>✓ {copy.unlock2}</li><li>✓ {copy.unlock3}</li><li>✓ {copy.unlock4}</li>
                </ul>
                <Link href="/support" className="mt-6 inline-flex w-full justify-center rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-slate-950 hover:bg-white">{copy.unlockCta}</Link>
                <p className="mt-3 text-center text-xs text-cyan-50/70">{copy.safeNote}</p>
              </section>
            </aside>
          </div>
        )}
      </section>
    </main>
  )
}
