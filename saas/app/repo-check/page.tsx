'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type CheckItem = { id: string; packageName: string; version: string; sourceFile?: string; severity?: string; summary?: string; fixedVersionAvailable?: boolean }

type Copy = {
  back: string
  badge: string
  title: string
  subtitle: string
  repoLabel: string
  placeholder: string
  check: string
  checking: string
  hint: string
  trySample: string
  missingUrl: string
  checkFailed: string
  ready: string
  begin: string
  packages: string
  findings: string
  critical: string
  high: string
  repoChecked: string
  topFindings: string
  noFindings: string
  patched: string
  source: string
  requestTitle: string
  requestBody: string
  requestCta: string
  safeNote: string
  severities: Record<string, string>
}

const COPY: Record<Lang, Copy> = {
  en: { back: 'SignalBoost', badge: 'Free developer utility', title: 'Run a free public GitHub dependency risk preview.', subtitle: 'Paste a public repository URL and get a capped package advisory summary. The free check shows the signal; Audit Pro unlocks the complete review workflow.', repoLabel: 'Public GitHub repository', placeholder: 'https://github.com/owner/repo', check: 'Run free check', checking: 'Checking…', hint: 'Public repos only. Free preview is capped and does not access private code.', trySample: 'Try SignalBoost itself', missingUrl: 'Paste a public GitHub repository URL first.', checkFailed: 'Could not check this repository.', ready: 'Ready', begin: 'Paste a repo URL to begin', packages: 'Packages', findings: 'Findings', critical: 'Critical', high: 'High', repoChecked: 'Repository checked', topFindings: 'Top findings', noFindings: 'No known package advisories found in this capped preview. This is not a full audit, but it is a good first signal.', patched: 'patched version available', source: 'Source', requestTitle: 'Request an audit plan', requestBody: 'Send this result to the COS Marketing + Sales engine. It will create a tagged audit lead and prepare an owner-approved follow-up plan. Nothing sends automatically.', requestCta: 'Request audit plan', safeNote: 'No code changes or follow-up happen without approval.', severities: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', unknown: 'Unknown' } },
  es: { back: 'SignalBoost', badge: 'Utilidad gratuita para desarrolladores', title: 'Ejecuta una vista previa gratuita de riesgo de dependencias en GitHub.', subtitle: 'Pega la URL de un repositorio público y recibe un resumen limitado de avisos de paquetes.', repoLabel: 'Repositorio público de GitHub', placeholder: 'https://github.com/owner/repo', check: 'Ejecutar revisión gratis', checking: 'Revisando…', hint: 'Solo repos públicos. La vista previa está limitada y no accede a código privado.', trySample: 'Probar SignalBoost', missingUrl: 'Pega primero una URL de repositorio público.', checkFailed: 'No se pudo revisar este repositorio.', ready: 'Listo', begin: 'Pega una URL para comenzar', packages: 'Paquetes', findings: 'Hallazgos', critical: 'Críticos', high: 'Altos', repoChecked: 'Repositorio revisado', topFindings: 'Principales hallazgos', noFindings: 'No se encontraron avisos conocidos de paquetes en esta vista previa. No es una auditoría completa, pero es una buena primera señal.', patched: 'versión corregida disponible', source: 'Fuente', requestTitle: 'Solicitar plan de auditoría', requestBody: 'Envía este resultado al motor COS Marketing + Ventas. Creará un lead de auditoría y preparará un seguimiento aprobado por el propietario. Nada se envía automáticamente.', requestCta: 'Solicitar plan de auditoría', safeNote: 'No hay cambios de código ni seguimiento sin aprobación.', severities: { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', unknown: 'Desconocido' } },
  pt: { back: 'SignalBoost', badge: 'Utilitário gratuito para desenvolvedores', title: 'Execute uma prévia gratuita de risco de dependências no GitHub.', subtitle: 'Cole a URL de um repositório público e receba um resumo limitado de avisos de pacotes.', repoLabel: 'Repositório público do GitHub', placeholder: 'https://github.com/owner/repo', check: 'Executar verificação grátis', checking: 'Verificando…', hint: 'Apenas repos públicos. A prévia é limitada e não acessa código privado.', trySample: 'Testar SignalBoost', missingUrl: 'Cole primeiro a URL de um repositório público.', checkFailed: 'Não foi possível verificar este repositório.', ready: 'Pronto', begin: 'Cole uma URL para começar', packages: 'Pacotes', findings: 'Constatações', critical: 'Críticas', high: 'Altas', repoChecked: 'Repositório verificado', topFindings: 'Principais constatações', noFindings: 'Nenhum aviso conhecido de pacote foi encontrado nesta prévia. Isto não é uma auditoria completa, mas é um bom primeiro sinal.', patched: 'versão corrigida disponível', source: 'Fonte', requestTitle: 'Solicitar plano de auditoria', requestBody: 'Envie este resultado ao motor COS Marketing + Vendas. Ele criará um lead de auditoria e preparará um follow-up aprovado pelo proprietário. Nada é enviado automaticamente.', requestCta: 'Solicitar plano de auditoria', safeNote: 'Nenhuma alteração de código ou follow-up acontece sem aprovação.', severities: { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', unknown: 'Desconhecida' } },
  pl: { back: 'SignalBoost', badge: 'Darmowe narzędzie dla deweloperów', title: 'Uruchom darmowy podgląd ryzyka zależności w publicznym repozytorium GitHub.', subtitle: 'Wklej URL publicznego repozytorium i otrzymaj ograniczone podsumowanie ostrzeżeń pakietów.', repoLabel: 'Publiczne repozytorium GitHub', placeholder: 'https://github.com/owner/repo', check: 'Uruchom darmowe sprawdzenie', checking: 'Sprawdzanie…', hint: 'Tylko publiczne repozytoria. Podgląd jest ograniczony i nie uzyskuje dostępu do prywatnego kodu.', trySample: 'Sprawdź SignalBoost', missingUrl: 'Najpierw wklej URL publicznego repozytorium.', checkFailed: 'Nie udało się sprawdzić tego repozytorium.', ready: 'Gotowe', begin: 'Wklej URL repozytorium, aby zacząć', packages: 'Pakiety', findings: 'Wyniki', critical: 'Krytyczne', high: 'Wysokie', repoChecked: 'Sprawdzone repozytorium', topFindings: 'Najważniejsze wyniki', noFindings: 'Nie znaleziono znanych ostrzeżeń pakietów w tym podglądzie. To nie jest pełny audyt, ale dobry pierwszy sygnał.', patched: 'dostępna wersja poprawiona', source: 'Źródło', requestTitle: 'Poproś o plan audytu', requestBody: 'Wyślij ten wynik do silnika COS Marketing + Sprzedaż. Utworzy leada audytowego i przygotuje follow-up do akceptacji właściciela. Nic nie wysyła się automatycznie.', requestCta: 'Poproś o plan audytu', safeNote: 'Bez zmian kodu i follow-up bez akceptacji.', severities: { critical: 'Krytyczne', high: 'Wysokie', medium: 'Średnie', low: 'Niskie', unknown: 'Nieznane' } },
  ru: { back: 'SignalBoost', badge: 'Бесплатный инструмент для разработчиков', title: 'Запустите бесплатный обзор риска зависимостей GitHub.', subtitle: 'Вставьте URL публичного репозитория и получите ограниченное резюме предупреждений по пакетам.', repoLabel: 'Публичный репозиторий GitHub', placeholder: 'https://github.com/owner/repo', check: 'Запустить бесплатную проверку', checking: 'Проверка…', hint: 'Только публичные репозитории. Обзор ограничен и не получает доступ к приватному коду.', trySample: 'Проверить SignalBoost', missingUrl: 'Сначала вставьте URL публичного репозитория.', checkFailed: 'Не удалось проверить этот репозиторий.', ready: 'Готово', begin: 'Вставьте URL репозитория, чтобы начать', packages: 'Пакеты', findings: 'Замечания', critical: 'Критические', high: 'Высокие', repoChecked: 'Проверенный репозиторий', topFindings: 'Главные замечания', noFindings: 'В этом обзоре не найдено известных предупреждений по пакетам. Это не полный аудит, но хороший первый сигнал.', patched: 'доступна исправленная версия', source: 'Источник', requestTitle: 'Запросить план аудита', requestBody: 'Отправьте этот результат в COS Marketing + Sales engine. Он создаст audit lead и подготовит follow-up для утверждения владельцем. Ничего не отправляется автоматически.', requestCta: 'Запросить план аудита', safeNote: 'Без изменений кода и follow-up без утверждения.', severities: { critical: 'Критическая', high: 'Высокая', medium: 'Средняя', low: 'Низкая', unknown: 'Неизвестная' } },
}

const SEVERITY_STYLES: Record<string, string> = { critical: 'border-red-400/40 bg-red-400/10 text-red-100', high: 'border-orange-300/40 bg-orange-300/10 text-orange-100', medium: 'border-yellow-300/40 bg-yellow-300/10 text-yellow-100', low: 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100', unknown: 'border-white/15 bg-white/5 text-white/70' }
function activeLang(lang: string): Lang { return (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang }
function planHref(target: string) { return `/request-plan?source=repo_check&target=${encodeURIComponent(target)}` }

export default function RepoCheckPage() {
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
      const res = await fetch('/api/public/surface-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim(), maxPackages: 75 }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(copy.checkFailed); return }
      setData(json)
      window.localStorage.setItem('signalboost.concierge.utilityContext', JSON.stringify({ source: 'repo_check', target: json.target?.url || url.trim(), report: `Free Repo Check report for ${json.target?.url || url.trim()}: packages ${json.summary?.packagesScanned ?? json.summary?.packageCount ?? 'n/a'}, advisories ${json.summary?.advisoryCount ?? 'n/a'}, critical ${json.summary?.critical ?? 'n/a'}, high ${json.summary?.high ?? 'n/a'}. Top findings: ${(json.topAdvisories || []).slice(0, 5).map((f: any) => `${f.packageName} ${f.version}`).join(', ') || 'none flagged'}.` }))
      window.dispatchEvent(new Event('signalboost:concierge-utility-context'))
    } catch { setError(copy.checkFailed) } finally { setLoading(false) }
  }

  const summary = data?.summary || null
  const top: CheckItem[] = Array.isArray(data?.topAdvisories) ? data.topAdvisories : []
  const target = String(data?.target?.url || url || '')
  const metricRows = useMemo(() => ([
    [copy.packages, summary?.packagesScanned ?? summary?.packageCount ?? '—'],
    [copy.findings, summary?.advisoryCount ?? top.length ?? '—'],
    [copy.critical, summary?.critical ?? '—'],
    [copy.high, summary?.high ?? '—'],
  ]), [copy, summary, top.length])

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
              <label className="text-sm font-bold text-slate-200" htmlFor="repo-url">{copy.repoLabel}</label>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input id="repo-url" value={url} onChange={event => setUrl(event.target.value)} placeholder={copy.placeholder} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300/20 focus:ring-4" />
                <button type="submit" disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 hover:bg-white disabled:opacity-60">{loading ? copy.checking : copy.check}</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400"><span>{copy.hint}</span><button type="button" onClick={() => setUrl('https://github.com/SignalBoost/signalboost-live')} className="font-bold text-cyan-200 hover:text-white">{copy.trySample}</button></div>
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
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">{copy.repoChecked}</p>
            <h2 className="mt-2 break-all text-xl font-black">{target}</h2>
            <h3 className="mb-4 mt-6 text-sm font-black uppercase tracking-[0.18em] text-slate-400">{copy.topFindings}</h3>
            {top.length === 0 ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-emerald-100">{copy.noFindings}</p> : <div className="grid gap-4">{top.map(item => { const severity = item.severity || 'unknown'; return <article key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${SEVERITY_STYLES[severity] || SEVERITY_STYLES.unknown}`}>{copy.severities[severity] || severity}</span>{item.fixedVersionAvailable && <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-xs font-bold text-emerald-100">{copy.patched}</span>}</div><h4 className="mt-3 text-lg font-black">{item.packageName} <span className="text-slate-400">{item.version}</span></h4><p className="mt-2 text-sm leading-6 text-slate-300">{item.summary}</p><p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{copy.source}: {item.sourceFile}</p></article> })}</div>}
          </section>
          <aside className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-6"><h3 className="text-2xl font-black">{copy.requestTitle}</h3><p className="mt-3 text-sm leading-6 text-cyan-50/80">{copy.requestBody}</p><Link href={planHref(target)} className="mt-6 inline-flex w-full justify-center rounded-xl bg-cyan-300 px-5 py-3 text-center font-black text-slate-950 hover:bg-white">{copy.requestCta}</Link><p className="mt-3 text-center text-xs text-cyan-50/70">{copy.safeNote}</p></aside>
        </div>}
      </section>
    </main>
  )
}
