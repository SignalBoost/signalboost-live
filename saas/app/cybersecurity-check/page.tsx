'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Finding = { code: string; category: 'transport' | 'headers' | 'cookies' | 'content' | 'exposure'; severity: 'high' | 'medium' | 'low'; value?: string | number | boolean }

type Copy = {
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
  ready: string
  begin: string
  score: string
  response: string
  findings: string
  high: string
  pageChecked: string
  topFindings: string
  noFindings: string
  signals: string
  requestTitle: string
  requestBody: string
  requestCta: string
  safeNote: string
  categories: Record<string, string>
  severities: Record<string, string>
}

const COPY: Record<Lang, Copy> = {
  en: { back: uiText('generatedUi.u_85647deec9865df5'), badge: uiText('generatedUi.u_324aca0b89853134'), title: uiText('generatedUi.u_10e4cd13df04e37a'), subtitle: uiText('generatedUi.u_fa1843441560b49a'), urlLabel: uiText('generatedUi.u_e9cb62d631733c50'), placeholder: uiText('generatedUi.u_100680ad546ce6a5'), scan: uiText('generatedUi.u_2fe2ed5dc5b95610'), scanning: uiText('generatedUi.u_ec963ffc911b8401'), hint: uiText('generatedUi.u_e467939bc0d74817'), trySample: uiText('generatedUi.u_470b58b8e271f524'), missingUrl: uiText('generatedUi.u_fae83b98fe90224a'), scanFailed: uiText('generatedUi.u_1d8ac05095f5585c'), ready: uiText('generatedUi.u_5fa7aac5375c5815'), begin: uiText('generatedUi.u_0bdbfa75aa2b32eb'), score: uiText('generatedUi.u_38e5a46cbc5ad328'), response: uiText('generatedUi.u_9061383b8e228ef3'), findings: uiText('generatedUi.u_e171c2ff25b55e5a'), high: uiText('generatedUi.u_c4ebc6d4a5832cd9'), pageChecked: uiText('generatedUi.u_311dd8c115a97a36'), topFindings: uiText('generatedUi.u_ced4b69af869a5f9'), noFindings: uiText('generatedUi.u_c32204cf6242c4cb'), signals: uiText('generatedUi.u_c9c42389583cb159'), requestTitle: uiText('generatedUi.u_e8c982e7fa1e66d4'), requestBody: uiText('generatedUi.u_1f89fb1c83055c76'), requestCta: uiText('generatedUi.u_64624918ae8e0995'), safeNote: uiText('generatedUi.u_88620660ddeacd55'), categories: { transport: uiText('generatedUi.u_aaead4abf5d0fd5e'), headers: uiText('generatedUi.u_194e9fe656a1bcab'), cookies: uiText('generatedUi.u_141395eb35564fe5'), content: uiText('generatedUi.u_47bd29075f8b8019'), exposure: uiText('generatedUi.u_cc5454a4b7ce2113') }, severities: { high: uiText('generatedUi.u_c4ebc6d4a5832cd9'), medium: uiText('generatedUi.u_8e588cd187741f1c'), low: uiText('generatedUi.u_f793de205ead5ac3') } },
  es: { back: 'SignalBoost', badge: 'Vista previa gratuita de ciberseguridad', title: 'Revisa gratis señales públicas de seguridad web.', subtitle: 'Pega una URL pública y recibe una vista previa segura de HTTPS, cabeceras, cookies, contenido mixto e indicadores de exposición.', urlLabel: 'URL pública del sitio', placeholder: 'https://ejemplo.com', scan: 'Ejecutar vista de ciberseguridad', scanning: 'Revisando…', hint: 'Solo página pública. Sin escaneo de puertos, exploits, login privado, crawling ni cambios automáticos.', trySample: 'Probar SignalBoost', missingUrl: 'Pega primero una URL pública.', scanFailed: 'No se pudo revisar este sitio.', ready: 'Listo', begin: 'Pega una URL para comenzar', score: 'Puntuación', response: 'Respuesta', findings: 'Hallazgos', high: 'Alta', pageChecked: 'Página revisada', topFindings: 'Principales señales de seguridad', noFindings: 'No se marcaron señales públicas importantes. No es una auditoría completa, pero es una buena primera revisión.', signals: 'Señales observadas', requestTitle: 'Solicitar plan de seguridad', requestBody: 'Envía este resultado al motor COS Marketing + Ventas. Creará un lead de ciberseguridad y preparará un seguimiento aprobado por el propietario. Nada se envía automáticamente.', requestCta: 'Solicitar plan de seguridad', safeNote: 'No hay pruebas ni seguimiento sin aprobación.', categories: { transport: 'Transporte', headers: 'Cabeceras', cookies: 'Cookies', content: 'Contenido', exposure: 'Exposición' }, severities: { high: 'Alta', medium: 'Media', low: 'Baja' } },
  pt: { back: 'SignalBoost', badge: 'Prévia gratuita de cibersegurança', title: 'Verifique sinais públicos de segurança do site gratuitamente.', subtitle: 'Cole uma URL pública e receba uma prévia segura de HTTPS, cabeçalhos, cookies, conteúdo misto e indicadores de exposição.', urlLabel: 'URL pública do site', placeholder: 'https://exemplo.com', scan: 'Executar prévia de cibersegurança', scanning: 'Verificando…', hint: 'Apenas página pública. Sem varredura de portas, exploits, login privado, crawling ou mudanças automáticas.', trySample: 'Testar SignalBoost', missingUrl: 'Cole primeiro uma URL pública.', scanFailed: 'Não foi possível verificar este site.', ready: 'Pronto', begin: 'Cole uma URL para começar', score: 'Pontuação', response: 'Resposta', findings: 'Constatações', high: 'Alta', pageChecked: 'Página verificada', topFindings: 'Principais sinais de segurança', noFindings: 'Nenhum sinal público importante foi marcado. Não é uma auditoria completa, mas é uma boa primeira verificação.', signals: 'Sinais observados', requestTitle: 'Solicitar plano de segurança', requestBody: 'Envie este resultado ao motor COS Marketing + Vendas. Ele criará um lead de cibersegurança e preparará um follow-up aprovado pelo proprietário. Nada é enviado automaticamente.', requestCta: 'Solicitar plano de segurança', safeNote: 'Nenhum teste ou follow-up acontece sem aprovação.', categories: { transport: 'Transporte', headers: 'Cabeçalhos', cookies: 'Cookies', content: 'Conteúdo', exposure: 'Exposição' }, severities: { high: 'Alta', medium: 'Média', low: 'Baixa' } },
  pl: { back: 'SignalBoost', badge: 'Darmowy podgląd cyberbezpieczeństwa', title: 'Sprawdź bezpłatnie publiczne sygnały bezpieczeństwa strony.', subtitle: 'Wklej publiczny URL i otrzymaj bezpieczny podgląd HTTPS, nagłówków, cookies, mixed content i ekspozycji.', urlLabel: 'Publiczny URL strony', placeholder: 'https://example.com', scan: 'Uruchom podgląd bezpieczeństwa', scanning: 'Sprawdzanie…', hint: 'Tylko publiczna strona. Bez skanowania portów, exploitów, prywatnego logowania, crawlowania i automatycznych zmian.', trySample: 'Sprawdź SignalBoost', missingUrl: 'Najpierw wklej publiczny URL.', scanFailed: 'Nie udało się sprawdzić tej strony.', ready: 'Gotowe', begin: 'Wklej URL, aby zacząć', score: 'Wynik', response: 'Odpowiedź', findings: 'Wyniki', high: 'Wysoka', pageChecked: 'Sprawdzona strona', topFindings: 'Najważniejsze sygnały bezpieczeństwa', noFindings: 'Nie oznaczono ważnych publicznych sygnałów. To nie jest pełny audyt, ale dobry pierwszy test.', signals: 'Zaobserwowane sygnały', requestTitle: 'Poproś o plan bezpieczeństwa', requestBody: 'Wyślij ten wynik do silnika COS Marketing + Sprzedaż. Utworzy cyberbezpieczeństwa leada i przygotuje follow-up do akceptacji właściciela. Nic nie wysyła się automatycznie.', requestCta: 'Poproś o plan bezpieczeństwa', safeNote: 'Bez testów i follow-up bez akceptacji.', categories: { transport: 'Transport', headers: 'Nagłówki', cookies: 'Cookies', content: 'Treść', exposure: 'Ekspozycja' }, severities: { high: 'Wysoka', medium: 'Średnia', low: 'Niska' } },
  ru: { back: 'SignalBoost', badge: 'Бесплатный обзор кибербезопасности', title: 'Бесплатно проверьте публичные сигналы безопасности сайта.', subtitle: 'Вставьте публичный URL и получите безопасный обзор HTTPS, headers, cookies, mixed content и exposure.', urlLabel: 'Публичный URL сайта', placeholder: 'https://example.com', scan: 'Запустить обзор безопасности', scanning: 'Проверка…', hint: 'Только публичная страница. Без сканирования портов, exploit testing, приватного логина, crawling и автоматических изменений.', trySample: 'Проверить SignalBoost', missingUrl: 'Сначала вставьте публичный URL.', scanFailed: 'Не удалось проверить этот сайт.', ready: 'Готово', begin: 'Вставьте URL, чтобы начать', score: 'Оценка', response: 'Ответ', findings: 'Замечания', high: 'Высокая', pageChecked: 'Проверенная страница', topFindings: 'Главные сигналы безопасности', noFindings: 'Серьёзные публичные сигналы не отмечены. Это не полный аудит, но хороший первый тест.', signals: 'Наблюдаемые сигналы', requestTitle: 'Запросить план безопасности', requestBody: 'Отправьте этот результат в COS Marketing + Sales engine. Он создаст cybersecurity lead и подготовит follow-up для утверждения владельцем. Ничего не отправляется автоматически.', requestCta: 'Запросить план безопасности', safeNote: 'Без тестов и follow-up без утверждения.', categories: { transport: 'Transport', headers: 'Headers', cookies: 'Cookies', content: 'Content', exposure: 'Exposure' }, severities: { high: 'Высокая', medium: 'Средняя', low: 'Низкая' } },
}

const SEVERITY_STYLES: Record<string, string> = { high: 'border-red-400/40 bg-red-400/10 text-red-100', medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100', low: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' }
function activeLang(lang: string): Lang { return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang }
function formatMs(ms?: number) { return !ms ? '0 ms' : ms > 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms` }
function planHref(target: string) { return `/request-plan?source=cybersecurity_check&target=${encodeURIComponent(target)}` }

export default function CybersecurityCheckPage() {
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
      const response = await fetch('/api/public/cybersecurity-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.ok) { setError(copy.scanFailed); return }
      setData(json)
      window.localStorage.setItem('signalboost.concierge.utilityContext', JSON.stringify({ source: 'cybersecurity_check', target: json.finalUrl || json.target || url.trim(), report: `Free Security Utility report for ${json.finalUrl || json.target || url.trim()}: score ${json.summary?.score ?? 'n/a'}, findings ${json.summary?.findings ?? 'n/a'}, high ${json.summary?.high ?? 'n/a'}. Security signals: ${(json.findings || []).slice(0, 5).map((f: any) => f.code).join(', ') || 'none flagged'}.` }))
      window.dispatchEvent(new Event('signalboost:concierge-utility-context'))
    } catch { setError(copy.scanFailed) } finally { setLoading(false) }
  }

  const summary = data?.summary || null
  const findings: Finding[] = Array.isArray(data?.findings) ? data.findings : []
  const signals = data?.signals || {}
  const target = String(data?.finalUrl || data?.target || url || '')
  const metricRows = useMemo(() => ([
    [copy.score, summary?.score ?? '—'],
    [copy.response, summary ? formatMs(summary.responseMs) : '—'],
    [copy.findings, summary?.findings ?? '—'],
    [copy.high, summary?.high ?? '—'],
  ]), [copy, summary])
  const signalRows = useMemo(() => Object.entries(signals).map(([key, value]) => [key.replace(/([A-Z])/g, ' $1'), value ? 'Yes' : 'No']), [signals])

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
              <label className="text-sm font-bold text-slate-200" htmlFor="cyber-url">{copy.urlLabel}</label>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input id="cyber-url" value={url} onChange={event => setUrl(event.target.value)} placeholder={copy.placeholder} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" />
                <button type="submit" disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 hover:bg-white disabled:opacity-60">{loading ? copy.scanning : copy.scan}</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400"><span>{copy.hint}</span><button type="button" onClick={() => setUrl('https://saas.signalboostapp.com')} className="font-bold text-cyan-200 hover:text-white">{copy.trySample}</button></div>
            </form>
            {error && <div className="mt-4 rounded-xl border border-red-300/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{error}</div>}
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-center justify-between gap-4"><span className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{data ? copy.ready : copy.begin}</span></div>
            <div className="mt-6 grid grid-cols-2 gap-3">{metricRows.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p><strong className="mt-2 block text-3xl text-cyan-100">{String(value)}</strong></div>)}</div>
          </aside>
        </div>

        {data && <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.42fr]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">{copy.pageChecked}</p>
            <h2 className="mt-2 break-all text-xl font-black">{target}</h2>
            <h3 className="mb-4 mt-6 text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.topFindings}</h3>
            {findings.length === 0 ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-emerald-100">{copy.noFindings}</p> : <div className="grid gap-4">{findings.map((finding, index) => <article key={`${finding.code}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${SEVERITY_STYLES[finding.severity] || SEVERITY_STYLES.low}`}>{copy.severities[finding.severity] || finding.severity}</span><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-300">{copy.categories[finding.category] || finding.category}</span></div><h4 className="mt-3 text-lg font-black">{finding.code.replaceAll('_', ' ')}</h4></article>)}</div>}
          </section>
          <aside className="space-y-6"><section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.signals}</h3><div className="mt-4 grid gap-3 text-sm">{signalRows.map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4 text-slate-300"><span>{label}</span><strong>{String(value)}</strong></div>)}</div></section><section className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-6"><h3 className="text-2xl font-black">{copy.requestTitle}</h3><p className="mt-3 text-sm leading-6 text-cyan-50/80">{copy.requestBody}</p><Link href={planHref(target)} className="mt-6 inline-flex w-full justify-center rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-slate-950 hover:bg-white">{copy.requestCta}</Link><p className="mt-3 text-center text-xs text-cyan-50/70">{copy.safeNote}</p></section></aside>
        </div>}
      </section>
    </main>
  )
}
