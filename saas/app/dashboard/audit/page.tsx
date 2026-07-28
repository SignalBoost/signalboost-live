'use client'

// saas/app/dashboard/audit/page.tsx
// Unified Audit Center — single centralized workspace at /dashboard/audit.
//   • Top: Audit Command Center (scan-path + max-files + Run audit), live tracker,
//     findings list, and run history.
//   • Bottom: the 12 compliance report cards in a responsive grid; clicking a card
//     opens a 520px right-side drawer that renders that report.
// Linear-style design tokens (bg-surface / border-border / bg-accent / text-text …),
// 5-locale i18n via useI18n + useTranslation. Owner/admin sees live report data;
// non-admins get an owner-scoped upgrade panel (reports read the workspace's own
// infrastructure and are admin-gated server-side).

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { useTranslation } from '@/components/i18n/useTranslation'
import RemediationLifecyclePanel, { type RemediationLifecycleState } from '@/components/audit/RemediationLifecyclePanel'
import { uiText } from '@/lib/i18n/uiText'

// The 12 live report views, mounted directly (NOT iframed) so they render inside
// the drawer without the global app shell/navbar. Each is code-split via lazy().
const REPORT_VIEWS: Record<string, ReturnType<typeof lazy>> = {
  executive:   lazy(() => import('@/app/hub/audit/executive/page')),
  providers:   lazy(() => import('@/app/hub/audit/providers/page')),
  secrets:     lazy(() => import('@/app/hub/audit/secrets/page')),
  identity:    lazy(() => import('@/app/hub/audit/identity/page')),
  github:      lazy(() => import('@/app/hub/audit/github/page')),
  vercel:      lazy(() => import('@/app/hub/audit/vercel/page')),
  supabase:    lazy(() => import('@/app/hub/audit/supabase/page')),
  stripe:      lazy(() => import('@/app/hub/audit/stripe/page')),
  activity:    lazy(() => import('@/app/hub/audit/activity/page')),
  compliance:  lazy(() => import('@/app/hub/audit/compliance/page')),
  remediation: lazy(() => import('@/app/hub/audit/remediation/page')),
  usage:       lazy(() => import('@/app/hub/audit/usage/page')),
}

type Finding = {
  file: string
  severity: string
  category: string
  title: string
  detail: string
  recommendation: string
  line?: number | null
  fixed?: boolean
  fixed_at?: string | null
}
type RunSummary = {
  id: string
  created_at: string
  status: string
  prefix: string | null
  files_scanned: number
  findings_count: number
}
type View = { findings: Finding[]; filesScanned: number; findingsCount: number; prefix?: string; status?: string }

type Sev = 'critical' | 'high' | 'medium' | 'low' | 'info'
type AuditCopy = {
  title: string; subtitle: string; viewPlans: string
  pathLabel: string; maxLabel: string; run: string; running: string
  filesScanned: string; findings: string; clean: string; remediatedClean: string; emptyHint: string
  ownerOnly: string; failed: string; quotaExceeded: string; category: string; recommendation: string; line: string
  history: string; noRuns: string; refresh: string
  statusRunning: string; statusComplete: string; statusApproved: string; statusFailed: string
  detail: string; close: string; viewSource: string
  approveAllFixes: string; approvingAllFixes: string; approvedAllFixes: string; approvalFailed: string; approvalSafety: string
  trackScan: string; trackAnalyze: string; trackReport: string; trackPrs: string
  cmdTitle: string; reportsTitle: string; reportsSubtitle: string; openReport: string; reportOwnerOnly: string; reportSyncHint: string; runningHint: string; pathHint: string; mvpBadge: string; viewOnline: string
  sev: Record<Sev, string>
}

const COPY: Record<string, AuditCopy> = {
  en: {
    title: uiText('generatedUi.u_281ad82f2d803589'), subtitle: uiText('generatedUi.u_934a65fc9170e02d'),
    viewPlans: uiText('generatedUi.u_a72e2bd3e148c05e'),
    approveAllFixes: uiText('generatedUi.u_ff3970c54ab564ba'), approvingAllFixes: uiText('generatedUi.u_09dc0ab783f64c3d'), approvedAllFixes: uiText('generatedUi.u_e6a22d5b4457acd3'), approvalFailed: uiText('generatedUi.u_5d0112f98b838e49'), approvalSafety: uiText('generatedUi.u_ca33e010247b6d52'),
    pathLabel: uiText('generatedUi.u_c83db0133850dfcc'), maxLabel: uiText('generatedUi.u_44a4735b1923c30e'), run: uiText('generatedUi.u_954b8f823bf04b88'), running: uiText('generatedUi.u_7b383bd141845ab4'),
    filesScanned: uiText('generatedUi.u_cd24a02cc5f8ad4e'), findings: uiText('generatedUi.u_e171c2ff25b55e5a'), clean: uiText('generatedUi.u_c872f8542484120c'),
    remediatedClean: uiText('generatedUi.u_9a3042753040b8a9'),
    emptyHint: uiText('generatedUi.u_431c7f0b6c84900a'),
    ownerOnly: uiText('generatedUi.u_f2358f72665a6cbd'), failed: uiText('generatedUi.u_892c84891df2323a'), quotaExceeded: uiText('generatedUi.u_1025689697be813c'),
    category: uiText('generatedUi.u_292c06f0045a45d0'), recommendation: uiText('generatedUi.u_bc92e0e35c9a7ba1'), line: uiText('generatedUi.u_d7852cd0d2453e8c'),
    history: uiText('generatedUi.u_addf321bfa5b8346'), noRuns: uiText('generatedUi.u_72a85758b69c1d33'), refresh: uiText('generatedUi.u_0e91610117029a62'),
    statusRunning: uiText('generatedUi.u_f4ccae29e1bb0c20'), statusComplete: uiText('generatedUi.u_143b270a32602d41'), statusApproved: uiText('generatedUi.u_87b42e40c2a290e0'), statusFailed: uiText('generatedUi.u_031a8f0f659df890'),
    detail: uiText('generatedUi.u_fb5f27d5457c4641'), close: uiText('generatedUi.u_7d9eb7acb13e2462'), viewSource: uiText('generatedUi.u_20672423d7169088'),
    trackScan: uiText('generatedUi.u_52d920bb15637915'), trackAnalyze: uiText('generatedUi.u_a7a3824e7c240994'), trackReport: uiText('generatedUi.u_0fec6815da7d5965'), trackPrs: uiText('generatedUi.u_2a52812ce28a5eca'),
    cmdTitle: uiText('generatedUi.u_aa1964c6fdf0133f'), reportsTitle: uiText('generatedUi.u_04f05c93f943a85f'),
    reportsSubtitle: uiText('generatedUi.u_e1b6fab203c9da7c'),
    openReport: uiText('generatedUi.u_dcc839a4015c4b7d'), reportOwnerOnly: uiText('generatedUi.u_e3d42d82c35cf42e'),
    reportSyncHint: uiText('generatedUi.u_8a61828daee9b056'),
    mvpBadge: uiText('generatedUi.u_3953f7eea41d0899'), viewOnline: uiText('generatedUi.u_9376bfd66b34be75'),
    runningHint: uiText('generatedUi.u_642ddadbd00e1d09'), pathHint: uiText('generatedUi.u_0f89c02a75c394b0'),
    sev: { critical: uiText('generatedUi.u_427dd2969bd140be'), high: uiText('generatedUi.u_c4ebc6d4a5832cd9'), medium: uiText('generatedUi.u_8e588cd187741f1c'), low: uiText('generatedUi.u_f793de205ead5ac3'), info: uiText('generatedUi.u_170322a32f3c35b2') },
  },
  es: {
    title: 'Consola de Auditoría', subtitle: 'Análisis profundos de seguridad y calidad, aislados del tráfico de la consola en vivo.',
    viewPlans: 'Ver planes',
    approveAllFixes: 'Aprobar todas las correcciones', approvingAllFixes: 'Aprobando todas las correcciones…', approvedAllFixes: 'Todas las correcciones se aprobaron para esta ejecución de auditoría.', approvalFailed: 'No se pudieron aprobar todas las correcciones.', approvalSafety: 'Esta es la única aprobación. Después de aprobar, SignalBoost AI prepara todas las correcciones seguras compatibles, crea la solicitud interna protegida, espera las verificaciones, fusiona automáticamente, verifica el resultado y registra lo corregido. No se requiere ninguna otra acción.',
    pathLabel: 'URL del repositorio', maxLabel: 'Archivos máx.', run: 'Ejecutar auditoría', running: 'Ejecutando análisis profundo…',
    filesScanned: 'Archivos analizados', findings: 'Hallazgos', clean: 'Sin hallazgos: este análisis salió limpio.',
    remediatedClean: 'No quedan hallazgos activos: todos los hallazgos aprobados fueron corregidos y verificados.',
    emptyHint: 'Define una ruta y ejecuta un análisis, o elige una ejecución anterior.',
    ownerOnly: 'Se requiere acceso de propietario para ejecutar auditorías.', failed: 'La auditoría falló', quotaExceeded: 'Límite mensual alcanzado: {used}/{cap} análisis usados. Mejora tu plan para ejecutar más.',
    category: 'Categoría', recommendation: 'Recomendación', line: 'Línea',
    history: 'Historial', noRuns: 'Aún no hay ejecuciones.', refresh: 'Actualizar',
    statusRunning: 'En curso', statusComplete: 'Completado', statusApproved: 'Aprobado', statusFailed: 'Falló',
    detail: 'Detalle', close: 'Cerrar', viewSource: 'Ver en GitHub',
    trackScan: 'Escaneando objetivo', trackAnalyze: 'Ejecutando analizadores', trackReport: 'Generando informe', trackPrs: 'Preparando parches',
    cmdTitle: 'Centro de Comando de Auditoría', reportsTitle: 'Informes de Cumplimiento y Preparación',
    reportsSubtitle: 'Doce informes de preparación sobre identidad, proveedores, secretos, código, facturación y remediación.',
    openReport: 'Ver', reportOwnerOnly: 'Estos informes están limitados al propietario del espacio de trabajo. Mejora tu plan para generar informes de tu propio stack conectado.',
    reportSyncHint: 'Sincronizado con tu último análisis.',
    mvpBadge: 'MVP', viewOnline: 'Ver en línea',
    runningHint: 'Los análisis amplios pueden tardar unos minutos: sigue activo, deja la pestaña abierta.', pathHint: 'Pega la URL de un repo público de GitHub, p. ej. https://github.com/owner/repo',
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', info: 'Info' },
  },
  pt: {
    title: 'Console de Auditoria', subtitle: 'Análises profundas de segurança e qualidade, isoladas do tráfego do console ao vivo.',
    viewPlans: 'Ver planos',
    approveAllFixes: 'Aprovar todas as correções', approvingAllFixes: 'Aprovando todas as correções…', approvedAllFixes: 'Todas as correções foram aprovadas para esta execução de auditoria.', approvalFailed: 'Não foi possível aprovar todas as correções.', approvalSafety: 'Esta é a única aprovação. Depois da aprovação, a SignalBoost AI prepara todas as correções seguras compatíveis, cria o pull request interno protegido, aguarda as verificações, faz a fusão automaticamente, verifica o resultado e registra o que foi corrigido. Nenhuma outra ação é necessária.',
    pathLabel: 'URL do repositório', maxLabel: 'Máx. de arquivos', run: 'Executar auditoria', running: 'Executando análise profunda…',
    filesScanned: 'Arquivos analisados', findings: 'Constatações', clean: 'Nenhuma constatação — esta análise voltou limpa.',
    remediatedClean: 'Não restam constatações ativas — todas as constatações aprovadas foram corrigidas e verificadas.',
    emptyHint: 'Defina um caminho e execute uma análise, ou escolha uma execução anterior.',
    ownerOnly: 'É necessário acesso de proprietário para executar auditorias.', failed: 'A auditoria falhou', quotaExceeded: 'Limite mensal atingido: {used}/{cap} análises usadas. Faça upgrade do seu plano para executar mais.',
    category: 'Categoria', recommendation: 'Recomendação', line: 'Linha',
    history: 'Histórico', noRuns: 'Ainda não há execuções.', refresh: 'Atualizar',
    statusRunning: 'Em execução', statusComplete: 'Concluído', statusApproved: 'Aprovado', statusFailed: 'Falhou',
    detail: 'Detalhe', close: 'Fechar', viewSource: 'Ver no GitHub',
    trackScan: 'Verificando alvo', trackAnalyze: 'Executando analisadores', trackReport: 'Gerando relatório', trackPrs: 'Preparando correções',
    cmdTitle: 'Central de Comando de Auditoria', reportsTitle: 'Relatórios de Conformidade e Prontidão',
    reportsSubtitle: 'Doze relatórios de prontidão sobre identidade, provedores, segredos, código, faturamento e remediação.',
    openReport: 'Ver', reportOwnerOnly: 'Estes relatórios são restritos ao proprietário do espaço de trabalho. Faça upgrade do seu plano para gerar relatórios do seu próprio stack conectado.',
    reportSyncHint: 'Sincronizado com sua última análise.',
    mvpBadge: 'MVP', viewOnline: 'Ver online',
    runningHint: 'Escopos grandes podem levar alguns minutos — continua ativo, mantenha a aba aberta.', pathHint: 'Cole a URL de um repo público do GitHub, ex. https://github.com/owner/repo',
    sev: { critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', info: 'Info' },
  },
  pl: {
    title: 'Konsola Audytu', subtitle: 'Dogłębne skany bezpieczeństwa i jakości, odizolowane od ruchu konsoli na żywo.',
    viewPlans: 'Zobacz plany',
    approveAllFixes: 'Zatwierdź wszystkie poprawki', approvingAllFixes: 'Zatwierdzanie wszystkich poprawek…', approvedAllFixes: 'Wszystkie poprawki zostały zatwierdzone dla tego uruchomienia audytu.', approvalFailed: 'Nie udało się zatwierdzić wszystkich poprawek.', approvalSafety: 'To jest jedyna zgoda. Po zatwierdzeniu SignalBoost AI przygotuje wszystkie obsługiwane bezpieczne poprawki, utworzy chroniony wewnętrzny pull request, poczeka na kontrole, automatycznie scali zmiany, zweryfikuje wynik i zapisze naprawione elementy. Nie jest wymagane żadne dalsze działanie.',
    pathLabel: 'URL repozytorium', maxLabel: 'Maks. plików', run: 'Uruchom audyt', running: 'Trwa dogłębne skanowanie…',
    filesScanned: 'Przeskanowane pliki', findings: 'Wyniki', clean: 'Brak wyników — ten skan jest czysty.',
    remediatedClean: 'Nie pozostały żadne aktywne wyniki — wszystkie zatwierdzone wyniki zostały naprawione i zweryfikowane.',
    emptyHint: 'Ustaw ścieżkę i uruchom skan lub wybierz wcześniejsze uruchomienie.',
    ownerOnly: 'Do uruchamiania audytów wymagany jest dostęp właściciela.', failed: 'Audyt nie powiódł się', quotaExceeded: 'Osiągnięto miesięczny limit: wykorzystano {used}/{cap} skanów. Ulepsz plan, aby uruchomić więcej.',
    category: 'Kategoria', recommendation: 'Zalecenie', line: 'Wiersz',
    history: 'Historia', noRuns: 'Brak uruchomień.', refresh: 'Odśwież',
    statusRunning: 'W toku', statusComplete: 'Zakończono', statusApproved: 'Zatwierdzono', statusFailed: 'Niepowodzenie',
    detail: 'Szczegóły', close: 'Zamknij', viewSource: 'Zobacz na GitHub',
    trackScan: 'Skanowanie celu', trackAnalyze: 'Uruchamianie analizatorów', trackReport: 'Generowanie raportu', trackPrs: 'Przygotowywanie poprawek',
    cmdTitle: 'Centrum Dowodzenia Audytu', reportsTitle: 'Raporty Zgodności i Gotowości',
    reportsSubtitle: 'Dwanaście raportów gotowości obejmujących tożsamość, dostawców, sekrety, kod, płatności i naprawę.',
    openReport: 'Otwórz', reportOwnerOnly: 'Te raporty są dostępne tylko dla właściciela przestrzeni roboczej. Ulepsz plan, aby generować raporty dla własnego połączonego stosu.',
    reportSyncHint: 'Zsynchronizowano z najnowszym skanem.',
    mvpBadge: 'MVP', viewOnline: 'Zobacz online',
    runningHint: 'Duże zakresy mogą potrwać kilka minut — działa dalej, zostaw kartę otwartą.', pathHint: 'Wklej URL publicznego repozytorium GitHub, np. https://github.com/owner/repo',
    sev: { critical: 'Krytyczny', high: 'Wysoki', medium: 'Średni', low: 'Niski', info: 'Info' },
  },
  ru: {
    title: 'Консоль аудита', subtitle: 'Глубокие проверки безопасности и качества, изолированные от живого трафика консоли.',
    viewPlans: 'Посмотреть планы',
    approveAllFixes: 'Одобрить все исправления', approvingAllFixes: 'Одобряются все исправления…', approvedAllFixes: 'Все исправления одобрены для этого запуска аудита.', approvalFailed: 'Не удалось одобрить все исправления.', approvalSafety: 'Это единственное одобрение. После одобрения SignalBoost AI подготовит все поддерживаемые безопасные исправления, создаст защищённый внутренний pull request, дождётся проверок, автоматически выполнит слияние, проверит результат и запишет исправленные элементы. Дополнительные действия не требуются.',
    pathLabel: 'URL репозитория', maxLabel: 'Макс. файлов', run: 'Запустить аудит', running: 'Выполняется глубокое сканирование…',
    filesScanned: 'Просканировано файлов', findings: 'Замечания', clean: 'Замечаний нет — сканирование чистое.',
    remediatedClean: 'Активных замечаний не осталось — все одобренные замечания исправлены и проверены.',
    emptyHint: 'Укажите путь и запустите сканирование или выберите прошлый запуск.',
    ownerOnly: 'Для запуска аудита требуется доступ владельца.', failed: 'Аудит не выполнен', quotaExceeded: 'Достигнут месячный лимит: использовано {used}/{cap} проверок. Обновите план, чтобы запускать больше.',
    category: 'Категория', recommendation: 'Рекомендация', line: 'Строка',
    history: 'История запусков', noRuns: 'Запусков пока нет.', refresh: 'Обновить',
    statusRunning: 'Выполняется', statusComplete: 'Завершено', statusApproved: 'Одобрено', statusFailed: 'Ошибка',
    detail: 'Подробности', close: 'Закрыть', viewSource: 'Открыть на GitHub',
    trackScan: 'Сканирование цели', trackAnalyze: 'Запуск анализаторов', trackReport: 'Создание отчёта', trackPrs: 'Подготовка исправлений',
    cmdTitle: 'Командный центр аудита', reportsTitle: 'Отчёты о соответствии и готовности',
    reportsSubtitle: 'Двенадцать отчётов о готовности по идентификации, провайдерам, секретам, коду, биллингу и устранению.',
    openReport: 'Открыть', reportOwnerOnly: 'Эти отчёты доступны только владельцу рабочей области. Обновите план, чтобы создавать отчёты для своего подключённого стека.',
    reportSyncHint: 'Синхронизировано с последним сканированием.',
    mvpBadge: 'MVP', viewOnline: 'Открыть онлайн',
    runningHint: 'Большие области могут занять несколько минут — процесс активен, не закрывайте вкладку.', pathHint: 'Вставьте URL публичного репозитория GitHub, напр. https://github.com/owner/repo',
    sev: { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий', info: 'Инфо' },
  },
}
function copyFor(lang: string): AuditCopy { return COPY[lang] || COPY.en }

// The 12 compliance reports. `key` maps to the live report page at /hub/audit/<key>.
type ReportCard = { key: string; icon: string; title: string; desc: string; mvp?: boolean }
const REPORTS: ReportCard[] = [
  { key: 'executive',   icon: '📑', title: uiText('generatedUi.u_d2bced23821d0590'),      desc: 'Synthesized markdown brief: posture, top risks, and the bottom line.', mvp: true },
  { key: 'providers',   icon: '📦', title: uiText('generatedUi.u_2a93e812bc1ecd33'),          desc: 'Stripe, Vercel, Supabase, and GitHub connection status & risk.', mvp: true },
  { key: 'identity',    icon: '👤', title: uiText('generatedUi.u_d77b1e19b500e122'),     desc: 'User access controls, owner rights, stale accounts, and MFA gaps.', mvp: true },
  { key: 'secrets',     icon: '🔑', title: uiText('generatedUi.u_64aac100a24f0a81'),   desc: 'Hardcoded credentials, token rotation age, and exposure risk.', mvp: true },
  { key: 'remediation', icon: '🛠️', title: uiText('generatedUi.u_c84b05c33aa16e03'),         desc: 'The actionable fix engine: prioritized fixes, owners, due dates.', mvp: true },
  { key: 'github',      icon: '🐙', title: uiText('generatedUi.u_2a9a976e1d717fbe'),  desc: 'Branch protection, open PRs, stale branches, unreviewed changes.' },
  { key: 'vercel',      icon: '▲',  title: uiText('generatedUi.u_4fbd37cb0729b025'),      desc: 'Env vars, exposed variables, deployment and rollback status.' },
  { key: 'supabase',    icon: '🗄️', title: uiText('generatedUi.u_238bfc2f353bf894'), desc: 'RLS coverage, public tables, storage buckets, service-role use.' },
  { key: 'stripe',      icon: '💳', title: uiText('generatedUi.u_00f300f1151f4b6b'), desc: 'Products, prices, webhooks, and live vs test mode consistency.' },
  { key: 'pr-cockpit',  icon: '🔀', title: uiText('generatedUi.u_597be1d5ba1ab0f5'),    desc: 'Infrastructure change requests, approvals, and merge results.' },
  { key: 'compliance',  icon: '⚖️', title: uiText('generatedUi.u_c7aabad2515a60d0'),  desc: 'SOC 2 / ISO 27001 / NIST CSF / CIS readiness — no certification claims.' },
  { key: 'activity',    icon: '🧾', title: uiText('generatedUi.u_2a2fd3b8331fbbd1'),            desc: 'Activity timeline of actions, providers, risk, and results.' },
]

const SEV_ORDER: Sev[] = ['critical', 'high', 'medium', 'low', 'info']
function asSev(s: string): Sev {
  const k = String(s || 'info').toLowerCase() as Sev
  return SEV_ORDER.includes(k) ? k : 'info'
}
// Token-aligned severity colours.
function sevText(sev: Sev): string {
  if (sev === 'critical' || sev === 'high') return 'text-danger'
  if (sev === 'medium') return 'text-accent'
  return 'text-text-muted'
}
function statusText(s: string): string {
  if (s === 'running') return 'text-accent'
  if (s === 'failed') return 'text-danger'
  return 'text-[#34d399]'
}
function statusDot(s: string): string {
  if (s === 'running') return 'bg-accent'
  if (s === 'failed') return 'bg-danger'
  return 'bg-[#34d399]'
}
function statusLabel(copy: AuditCopy, s: string): string { return s === 'running' ? copy.statusRunning : s === 'approved' ? copy.statusApproved : s === 'failed' ? copy.statusFailed : copy.statusComplete }
function timeShort(iso: string, lang: string): string {
  try { return new Date(iso).toLocaleString(lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}
function ghUrl(file: string, line?: number | null): string {
  const path = String(file || '').split('/').map(encodeURIComponent).join('/')
  return `https://github.com/SignalBoost/signalboost-live/blob/main/${path}${typeof line === 'number' ? `#L${line}` : ''}`
}

const PHASE_ORDER = ['SCAN_TARGET', 'RUN_ANALYZERS', 'GENERATE_REPORT', 'PREPARE_PRS'] as const

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function PhaseTracker({ phase, progress, copy }: { phase: string; progress: { done: number; total: number }; copy: AuditCopy }) {
  const labels: Record<string, string> = {
    SCAN_TARGET: copy.trackScan, RUN_ANALYZERS: copy.trackAnalyze, GENERATE_REPORT: copy.trackReport, PREPARE_PRS: copy.trackPrs,
  }
  const curIdx = phase === 'DONE' ? PHASE_ORDER.length : PHASE_ORDER.indexOf(phase as typeof PHASE_ORDER[number])
  return (
    <div className="mt-4 rounded-md border border-border bg-surface p-4">
      {PHASE_ORDER.map((p, i) => {
        const isDone = curIdx > i
        const active = curIdx === i
        const isAnalyze = p === 'RUN_ANALYZERS'
        const pct = isDone ? 100 : active ? (isAnalyze && progress.total > 0 ? Math.min(Math.round((progress.done / progress.total) * 100), 100) : 45) : 0
        const fill = isDone ? 'bg-[#34d399]' : active ? 'bg-accent' : 'bg-border'
        return (
          <div key={p} className={i < PHASE_ORDER.length - 1 ? 'mb-3' : ''}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className={`text-xs font-semibold ${active ? 'text-text' : isDone ? 'text-text-muted' : 'text-text-muted/70'}`}>{labels[p]}</span>
              {isAnalyze && active && progress.total > 0 && (
                <span className="font-mono text-[11px] text-text-muted">{progress.done}/{progress.total}</span>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg">
              <div className={`h-full rounded-full transition-all duration-300 ${fill}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AuditCenterPage() {
  const { lang } = useI18n()
  const { t } = useTranslation()
  const copy = copyFor(lang)

  const [prefix, setPrefix] = useState('')
  const [maxFiles, setMaxFiles] = useState(8)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [remediation, setRemediation] = useState<RemediationLifecycleState | null>(null)

  const [runs, setRuns] = useState<RunSummary[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })

  const [isAdmin, setIsAdmin] = useState(false)

  // Report drawer
  const [openReportKey, setOpenReportKey] = useState<string | null>(null)
  const [reportEntered, setReportEntered] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  // Finding drawer + patch flow
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/credits', { cache: 'no-store', credentials: 'include' })
      .then(r => r.json()).then(d => { if (alive) setIsAdmin(!!d?.isAdmin) })
      .catch(() => { /* default: not admin */ })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (selectedFinding) { const id = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(id) }
    setEntered(false)
  }, [selectedFinding])

  useEffect(() => {
    if (openReportKey) { const id = requestAnimationFrame(() => setReportEntered(true)); return () => cancelAnimationFrame(id) }
    setReportEntered(false)
  }, [openReportKey])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/hub/operator/audit/runs', { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) setRuns(data.runs || [])
    } catch { /* sidebar history is non-critical */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
  const status = String(remediation?.lifecycleStatus || '')
  const approvedWithoutLifecycle = view?.status === 'approved' && !status
  const terminal = ['merged', 'failed', 'partial'].includes(status)
  if (!selectedRunId || (!approvedWithoutLifecycle && (!status || terminal))) return
  const id = setInterval(() => { void openRun(selectedRunId) }, 10000)
  return () => clearInterval(id)
}, [selectedRunId, view?.status, remediation?.lifecycleStatus])

  // Elapsed-time heartbeat so a long run never looks frozen.
  useEffect(() => {
    if (!loading) return
    setElapsed(0)
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [loading])

  async function runNew() {
    setLoading(true); setError(null); setView(null); setSelectedRunId(null); setRemediation(null); setApprovalMessage(null)
    setPhase('SCAN_TARGET'); setProgress({ done: 0, total: 0 })
    try {
      const res = await fetch('/api/hub/operator/audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ url: prefix.trim(), maxFiles }),
      })
      if (res.status === 403) { setError(copy.ownerOnly); setPhase(null); return }
      if (res.status === 402) {
        const j = (await res.json().catch(() => null)) as { used?: number; cap?: number } | null
        setError(copy.quotaExceeded.replace('{used}', String(j?.used ?? '')).replace('{cap}', String(j?.cap ?? '')))
        setPhase(null); return
      }
      if (!res.body) { setError(copy.failed); setPhase(null); return }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let final: View | null = null
      let finalRunId: string | null = null
      let sawError = false
      // Read NDJSON phase events line by line.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
          if (!line) continue
          let evt: { phase?: string; done?: number; total?: number; error?: string; findings?: Finding[]; filesScanned?: string[]; findingsCount?: number; prefix?: string; runId?: string }
          try { evt = JSON.parse(line) } catch { continue }
          if (evt.phase === 'RUN_ANALYZERS') { setPhase('RUN_ANALYZERS'); setProgress({ done: evt.done || 0, total: evt.total || 0 }) }
          else if (evt.phase === 'SCAN_TARGET' || evt.phase === 'GENERATE_REPORT' || evt.phase === 'PREPARE_PRS') { setPhase(evt.phase) }
          else if (evt.phase === 'ERROR') { setError(evt.error || copy.failed); sawError = true }
          else if (evt.phase === 'DONE') {
            final = { findings: evt.findings || [], filesScanned: (evt.filesScanned || []).length, findingsCount: evt.findingsCount || 0, prefix: evt.prefix, status: 'complete' }
            finalRunId = evt.runId || null
          }
        }
      }
      if (final) {
        setView(final); setSelectedRunId(finalRunId); setPhase('DONE'); loadHistory()
        // Data sync: bump the refresh token so the 12 report cards/drawers reload fresh.
        setRefreshTick(x => x + 1)
      } else {
        setPhase(null)
        if (!sawError) setError(copy.failed)
      }
    } catch {
      setError(copy.failed); setPhase(null)
    } finally {
      setLoading(false)
    }
  }

  async function openRun(id: string) {
    setError(null); setApprovalMessage(null); setSelectedRunId(id)
    try {
      const res = await fetch(`/api/hub/operator/audit/runs?runId=${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) { setError(data?.error || copy.failed); return }
      const r = data.run
      const remediationState = (data.remediation || (r?.status === 'approved' ? {
      lifecycleStatus: 'preparing',
      findingsTotal: Number(r?.findings_count || 0),
      findingsApplied: 0,
      merged: false,
    } : null)) as RemediationLifecycleState | null
      setRemediation(remediationState)
      const log = data.log as { findings?: Finding[]; filesScanned?: string[]; findingsCount?: number; prefix?: string } | null
      const findings = (data.findings as Finding[]) || (log?.findings as Finding[]) || []
      setView({
        findings,
        filesScanned: Array.isArray(log?.filesScanned) ? log!.filesScanned!.length : (r?.files_scanned || 0),
        findingsCount: typeof log?.findingsCount === 'number' ? log!.findingsCount! : (r?.findings_count || 0),
        prefix: log?.prefix ?? r?.prefix,
        status: remediationState?.lifecycleStatus === 'merged' ? 'remediated' : r?.status,
      })
      if (remediationState?.lifecycleStatus === 'merged') {
        setRuns(current => current.map(item => item.id === id ? { ...item, status: 'remediated' } : item))
        void loadHistory()
      }
      setProgress({ done: 0, total: 0 })
      setPhase(r?.status === 'complete' || r?.status === 'remediated' || remediationState?.lifecycleStatus === 'merged' ? 'DONE' : null)
    } catch {
      setError(copy.failed)
    }
  }

  async function approveAllFixes() {
    if (!selectedRunId || !view || view.status === 'approved' || view.status === 'remediated') return
    setApprovingAll(true); setError(null); setApprovalMessage(null)
    try {
      const res = await fetch('/api/hub/operator/audit/approve-all', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: selectedRunId }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok || !result?.ok) { setError(result?.error || copy.approvalFailed); return }
      const lifecycle = (result.remediation || {
      lifecycleStatus: result.status || 'preparing',
      findingsTotal: Number(result.findingsApproved || view.findingsCount || 0),
      findingsApplied: Number(result.findingsFixed || 0),
      merged: result.status === 'merged',
    }) as RemediationLifecycleState
      setRemediation(lifecycle)
      const merged = result.status === 'merged' || lifecycle?.merged === true
      setView(current => current ? { ...current, status: merged ? 'remediated' : 'approved' } : current)
      setApprovalMessage(merged ? `${copy.approvedAllFixes} ${result.findingsFixed} ${copy.findings}.` : null)
      loadHistory()
    } catch {
      setError(copy.approvalFailed)
    } finally {
      setApprovingAll(false)
    }
  }

  const findings = (view?.findings || []).filter(finding => !finding.fixed)
  const openReport = openReportKey ? REPORTS.find(r => r.key === openReportKey) || null : null
  const closeReport = () => setOpenReportKey(null)
  const hasSynced = refreshTick > 0

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 font-sans text-text">
      <div className="mx-auto max-w-[1200px]">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">{copy.title}</h1>
            <p className="mt-1.5 max-w-[640px] text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
          </div>
          <a href="/dashboard/audit/pricing" className="inline-flex shrink-0 items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">
            {copy.viewPlans}
          </a>
        </div>

        {/* ── Audit Command Center (scan controller) ─────────────────────── */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm" aria-hidden>⚡</span>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{copy.cmdTitle}</h2>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[200px] flex-[1_1_280px] flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.pathLabel}</span>
              <input
                value={prefix}
                onChange={e => setPrefix(e.target.value)}
                placeholder={uiText('generatedUi.u_d7606d02f5e08d7c')}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <span className="text-[10.5px] leading-snug text-text-muted/80">{copy.pathHint}</span>
            </label>
            <label className="flex w-[120px] flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.maxLabel}</span>
              <input
                type="number" min={1} max={60} value={maxFiles}
                onChange={e => setMaxFiles(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </label>
            <button
              onClick={runNew}
              disabled={loading}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-accent bg-accent px-5 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110 disabled:opacity-60"
            >
              {loading ? copy.running : copy.run}
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 rounded-md border border-accent/40 bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-text">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
                {copy.running}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-text-muted">{fmtElapsed(elapsed)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
              <div className="h-full w-1/3 rounded-full bg-accent" style={{ animation: 'sbIndet 1.15s ease-in-out infinite' }} />
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">{copy.runningHint}</p>
            <style>{"@keyframes sbIndet{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}"}</style>
          </div>
        )}

        {phase && <PhaseTracker phase={phase} progress={progress} copy={copy} />}

        {!loading && view && view.findingsCount > 0 && selectedRunId && (phase === 'DONE' || view.status === 'complete' || view.status === 'approved' || view.status === 'remediated') && (
          <section className="mt-4 rounded-md border border-accent/40 bg-surface p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text">{view.status === 'approved' || view.status === 'remediated' ? copy.approvedAllFixes : copy.approveAllFixes}</h2>
                <p className="mt-1 max-w-[720px] text-[12.5px] leading-relaxed text-text-muted">{copy.approvalSafety}</p>
              </div>
              <button onClick={approveAllFixes} disabled={approvingAll || view.status === 'approved' || view.status === 'remediated'} className="rounded-md border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition-fast hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {approvingAll ? copy.approvingAllFixes : view.status === 'approved' || view.status === 'remediated' ? copy.approvedAllFixes : copy.approveAllFixes}
              </button>
            </div>
            <RemediationLifecyclePanel state={remediation} lang={lang} findingsApproved={view.findingsCount} />
          </section>
        )}
        {approvalMessage && <div className="mt-3 rounded-md border border-[#34d399]/40 bg-surface p-3 text-sm text-[#86efac]">{approvalMessage}</div>}

        {error && (
          <div className="mt-4 rounded-md border border-danger bg-surface p-3 text-sm text-danger">{copy.failed}: {error}</div>
        )}

        {/* Findings + history */}
        <div className="mt-4 flex flex-wrap items-start gap-4">
          {/* History */}
          <aside className="min-w-[240px] max-w-[300px] flex-[1_1_260px] rounded-md border border-border bg-surface p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.history}</span>
              <button onClick={loadHistory} className="rounded-md border border-border bg-bg px-2.5 py-1 text-[11px] font-semibold text-text-muted transition-fast hover:bg-surface">{copy.refresh}</button>
            </div>
            {runs.length === 0 ? (
              <div className="px-0.5 py-2 text-xs text-text-muted">{copy.noRuns}</div>
            ) : (
              <div className="flex max-h-[calc(100vh-280px)] flex-col gap-1.5 overflow-y-auto">
{runs.map(r => {
                  const active = r.id === selectedRunId
                  return (
                    <button
                      key={r.id}
                      onClick={() => openRun(r.id)}
                      className={`rounded-md border px-2.5 py-2 text-left transition-fast ${active ? 'border-accent bg-bg' : 'border-border bg-bg hover:border-accent'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(r.status)}`} />
                        <span className={`text-[11px] font-semibold ${statusText(r.status)}`}>{statusLabel(copy, r.status)}</span>
                        <span className={`ml-auto text-[11px] font-bold ${r.findings_count > 0 ? 'text-accent' : 'text-text-muted'}`}>{r.findings_count}</span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10.5px] text-text-muted">{r.prefix || '—'}</div>
                      <div className="mt-0.5 text-[10px] text-text-muted/70">{timeShort(r.created_at, lang)}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </aside>

          {/* Findings column */}
          <section id="audit-findings" className="min-w-[320px] flex-[999_1_420px] scroll-mt-6">
            {view ? (
              <>
                <div className="mb-3 flex flex-wrap gap-3">
                  <Stat label={copy.filesScanned} value={String(view.filesScanned)} accent="text-[#1af0ff]" />
                  <Stat label={copy.findings} value={String(findings.length)} accent="text-accent" />
                </div>
                {findings.length === 0 ? (
                  <div className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">{view.status === 'remediated' ? copy.remediatedClean : copy.clean}</div>
                ) : (
                  <div className="max-h-[calc(100vh-380px)] overflow-y-auto rounded-md border border-border bg-surface p-1.5">
                    {findings.map((f, i) => {
                      const sev = asSev(f.severity)
                      return (
                        <div
                          key={i}
                          onClick={() => setSelectedFinding(f)}
                          className={`cursor-pointer p-3.5 ${i < findings.length - 1 ? 'border-b border-border' : ''}`}
                        >
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className={`rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevText(sev)}`}>{copy.sev[sev]}</span>
                            <span className="text-sm font-semibold text-text">{f.title}</span>
                          </div>
                          <div className="mt-1.5 font-mono text-[11px] text-text-muted">
                            {f.file}{typeof f.line === 'number' ? `  ·  ${copy.line} ${f.line}` : ''}  ·  {copy.category}: {f.category}
                          </div>
                          {f.detail && <p className="mt-2 text-[13px] leading-relaxed text-text">{f.detail}</p>}
                          {f.recommendation && (
                            <div className="mt-2 rounded-md border border-border bg-bg px-3 py-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">{copy.recommendation}</span>
                              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{f.recommendation}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              !error && !loading && <div className="text-[12.5px] text-text-muted">{copy.emptyHint}</div>
            )}
          </section>
        </div>

        {/* ── Compliance & Readiness Reports (12-card grid) ──────────────── */}
        <div className="mt-10 mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm" aria-hidden>📊</span>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{copy.reportsTitle}</h2>
              <p className="mt-0.5 max-w-[680px] text-[12.5px] leading-relaxed text-text-muted/80">{copy.reportsSubtitle}</p>
            </div>
          </div>
          {hasSynced && (
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-[#34d399]">● {copy.reportSyncHint}</span>
          )}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {REPORTS.map((r, idx) => {
            const accent = idx % 2 === 0 ? 'text-accent' : 'text-[#1af0ff]'
            const isExec = r.key === 'executive'
            return (
              <button
                key={r.key}
                onClick={() => setOpenReportKey(r.key)}
                className={`flex flex-col gap-2 rounded-md border bg-surface p-4 text-left transition-fast hover:border-accent ${r.mvp ? 'border-accent ring-1 ring-accent/40' : 'border-border'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg" aria-hidden>{r.icon}</span>
                  <div className="flex items-center gap-1.5">
                    {r.mvp && <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-bg">{copy.mvpBadge}</span>}
                    {isExec && view && (
                      <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-bold text-accent">
                        {findings.length} {copy.findings}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold text-text">{t(`audit.center.${r.key}.title`, r.title)}</div>
                <div className="flex-1 text-[12px] leading-relaxed text-text-muted">{t(`audit.center.${r.key}.desc`, r.desc)}</div>
                <div className={`mt-1 text-[12px] font-semibold ${accent}`}>{copy.openReport} →</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Report drawer (520px) ─────────────────────────────────────────── */}
      {openReport && (
        <div
          onClick={closeReport}
          className="fixed inset-0 z-[1000] flex justify-end transition-[background] duration-200"
          style={{ background: reportEntered ? 'rgba(2,3,6,.62)' : 'rgba(2,3,6,0)', backdropFilter: reportEntered ? 'blur(4px)' : 'none', WebkitBackdropFilter: reportEntered ? 'blur(4px)' : 'none' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="fixed right-0 top-0 flex h-full w-[520px] max-w-full flex-col border-l border-border bg-surface p-6 transition-transform duration-300"
            style={{ transform: reportEntered ? 'translateX(0)' : 'translateX(100%)', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden>{openReport.icon}</span>
                <h2 className="text-base font-semibold text-text">{t(`audit.center.${openReport.key}.title`, openReport.title)}</h2>
              </div>
              <button onClick={closeReport} aria-label={copy.close} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-muted transition-fast hover:bg-bg">×</button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
              <a
                href={openReport.key === 'pr-cockpit' ? '/hub' : `/hub/audit/${openReport.key}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] font-semibold text-text transition-fast hover:border-accent"
              >
                ↗ {copy.viewOnline}
              </a>
            </div>

            {openReport.key === 'pr-cockpit' ? (
              <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-4 rounded-md border border-border bg-bg p-6">
                <span className="text-2xl" aria-hidden>🔀</span>
                <p className="text-sm leading-relaxed text-text-muted">{t('audit.center.prCockpitPending', "The PR Cockpit approval trail — infrastructure change requests, approvals, and merge results — lives in the Hub PR Cockpit. A dedicated report view is being wired to that data.")}</p>
                <a href="/hub" className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">{t('audit.center.openCockpit', "Open PR Cockpit")}</a>
              </div>
            ) : isAdmin ? (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-bg">
                {(() => {
                  const ReportView = REPORT_VIEWS[openReport.key]
                  return ReportView ? (
                    <Suspense fallback={<div className="p-6 text-sm text-text-muted">{t('audit.center.loading', "Loading report…")}</div>}>
                      <ReportView key={refreshTick} />
                    </Suspense>
                  ) : null
                })()}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-start justify-center gap-4 rounded-md border border-border bg-bg p-6">
                <span className="text-2xl" aria-hidden>🔒</span>
                <p className="text-sm leading-relaxed text-text-muted">{copy.reportOwnerOnly}</p>
                <a href="/dashboard/audit/pricing" className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg transition-fast hover:brightness-110">
                  {copy.viewPlans}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Finding-detail drawer ─────────────────────────────────────────── */}
      {selectedFinding && (() => {
        const sev = asSev(selectedFinding.severity)
        return (
          <div
            onClick={() => setSelectedFinding(null)}
            className="fixed inset-0 z-[1000] flex justify-end transition-[background] duration-200"
            style={{ background: entered ? 'rgba(2,3,6,.62)' : 'rgba(2,3,6,0)', backdropFilter: entered ? 'blur(4px)' : 'none', WebkitBackdropFilter: entered ? 'blur(4px)' : 'none' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="fixed right-0 top-0 h-full w-[480px] max-w-full overflow-y-auto border-l border-border bg-surface p-6 transition-transform duration-300"
              style={{ transform: entered ? 'translateX(0)' : 'translateX(100%)', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sevText(sev)}`}>{copy.sev[sev]}</span>
                <button onClick={() => setSelectedFinding(null)} aria-label={copy.close} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-muted transition-fast hover:bg-bg">×</button>
              </div>

              <h2 className="mt-3.5 mb-1 text-lg font-semibold leading-snug text-text">{selectedFinding.title}</h2>
              <div className="break-all font-mono text-[11.5px] text-text-muted">
                {selectedFinding.file}{typeof selectedFinding.line === 'number' ? `  ·  ${copy.line} ${selectedFinding.line}` : ''}
              </div>
              <div className="mt-1.5 text-[11px] text-text-muted">{copy.category}: {selectedFinding.category}</div>

              {selectedFinding.detail && (
                <div className="mt-4">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.detail}</div>
                  <p className="text-[13.5px] leading-relaxed text-text">{selectedFinding.detail}</p>
                </div>
              )}

              {selectedFinding.recommendation && (
                <div className="mt-4 rounded-md border border-border bg-bg px-3.5 py-3">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{copy.recommendation}</div>
                  <p className="text-[13px] leading-relaxed text-text-muted">{selectedFinding.recommendation}</p>
                </div>
              )}

              <a href={ghUrl(selectedFinding.file, selectedFinding.line)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block rounded-md border border-border px-3.5 py-2 text-[12.5px] font-semibold text-[#1af0ff] transition-fast hover:bg-bg">
                {copy.viewSource} ↗
              </a>
            </div>
          </div>
        )
      })()}
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="min-w-[130px] rounded-md border border-border bg-surface px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold leading-tight ${accent}`}>{value}</div>
    </div>
  )
}
