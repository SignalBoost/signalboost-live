'use client'

// saas/app/dashboard/cybersecurity/page.tsx
// Cybersecurity Center MVP. Audit = readiness/reports. Cybersecurity = technical
// monitoring checks, alert inbox, scheduled scans, plan-first remediation,
// and policy-bound routine preparation with separate human decisions and history.

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import CyberActivityPanel, { type CyberActivityState } from '@/components/cybersecurity/CyberActivityPanel'
import { uiText } from '@/lib/i18n/uiText'
import { needsHumanApproval, partitionRemediationRequests, isTerminalRemediation, eligibleDependencyTarget } from '@/lib/cyber/dependencyRemediationPolicy'
import { remediationAutonomyCopy } from '@/lib/cyber/remediationAutonomyCopy'
import { cyberReportPresentationCopy, dependencyRescanUrl, unclassifiedAdvisoryCount, cyberProductText } from '@/lib/cyber/cyberReportPresentation'

type Advisory = {
  id: string
  packageName: string
  version: string
  sourceFile: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  summary: string
  detailsUrl?: string
  aliases: string[]
  fixedVersions?: string[]
  affectedRanges?: string[]
}

type Report = {
  ok: boolean
  generatedAt: string
  target: string
  repo?: string
  branch?: string
  packages: { name: string; version: string; sourceFile: string }[]
  advisories: Advisory[]
  summary: { packagesScanned: number; advisories: number; critical: number; high: number; medium: number; low: number; unknown: number }
  error?: string
}

type ScanRow = {
  id: string
  target: string
  repo?: string
  branch?: string
  packages_scanned: number
  advisories_count: number
  critical: number
  high: number
  medium: number
  low: number
  unknown: number
  created_at: string
}

type MonitorRow = {
  id: string
  label?: string | null
  repo_url: string
  repo?: string | null
  branch?: string | null
  frequency: string
  is_enabled: boolean
  last_scan_at?: string | null
  last_status?: string | null
  last_error?: string | null
  last_advisories: number
  last_critical: number
  last_high: number
  created_at: string
}

type AlertRow = {
  id: string
  repo?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  advisory_id?: string | null
  package_name?: string | null
  package_version?: string | null
  title: string
  message: string
  details_url?: string | null
  status: 'open' | 'resolved' | 'ignored'
  created_at: string
}

type FixPlan = {
  title?: string
  summary?: string
  proposedChanges?: Array<{ packageName?: string; currentVersion?: string; targetVersion?: string | null; fixedVersions?: string[]; advisoryId?: string; severity?: string; sourceFile?: string; proposedAction?: string; changeType?: string }>
  validationSteps?: string[]
  safetyControls?: string[]
  nextStep?: string
  disposition?: string
  generatedAt?: string
}

type RemediationRequest = {
  id: string
  source_area: string
  source_type: string
  repo?: string | null
  target?: string | null
  title: string
  summary: string
  severity_summary?: Record<string, number>
  findings?: Array<{ summary?: string; sensitivePaths?: string[]; evidenceReference?: string }>
  status: 'awaiting_human_review' | 'approved' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'
  human_approval_required: boolean
  human_approved: boolean
  approved_at?: string | null
  approval_notes?: string | null
  fix_plan?: FixPlan | null
  fix_plan_status?: 'not_started' | 'ready_for_review' | 'approved_for_pr' | 'rejected' | string
  fix_plan_created_at?: string | null
  fix_plan_approved?: boolean
  fix_plan_approved_at?: string | null
  implementation_status?: string | null
  implementation_notes?: string | null
  pull_request_url?: string | null
  created_at: string
  updated_at?: string
}

type Filter = 'all' | 'open' | 'resolved' | 'ignored'

type LegacyCyberCopy = {
  eyebrow: string
  title: string
  subtitle: string
  auditCenter: string
  repositoryUrl: string
  repositoryPlaceholder: string
  repositoryHint: string
  monitorLabel: string
  monitorPlaceholder: string
  frequency: string
  daily: string
  weekly: string
  maxPackages: string
  runScan: string
  scanning: string
  addMonitor: string
  adding: string
  openAlerts: string
  monitors: string
  enabled: string
  recentScans: string
  awaitingApproval: string
  packages: string
  advisories: string
  critical: string
  high: string
  medium: string
  low: string
  prepareTitle: string
  prepareDescription: string
  prepareFixPlan: string
  preparingPlan: string
  humanQueue: string
  humanEmpty: string
  alertInbox: string
  noAlerts: string
  monitoredRepositories: string
  noMonitors: string
  technicalTable: string
  noAdvisories: string
  recentDependencyScans: string
  noStoredScans: string
  repository: string
  lastScan: string
  findings: string
  status: string
  action: string
  notScannedYet: string
  disable: string
  enable: string
  severity: string
  package: string
  advisory: string
  source: string
  date: string
  criticalHigh: string
  details: string
  issueReviewReport: string
  issueReviewTitle: string
  issueReviewSubtitle: string
  issuesFound: string
  affectedPackages: string
  filesReferenced: string
  whatWasFound: string
  whereFound: string
  whyMatters: string
  recommendedNextStep: string
  advisorySummary: string
  openAdvisory: string
  downloadPdf: string
  preparingPdf: string
  printSavePdf: string
  planFirst: string
  yes: string
  no: string
  humanApproved: string
  fixPlan: string
  notStarted: string
  fixApproved: string
  prPrepared: string
  viewPr: string
  approved: string
  rejected: string
  approvePlan: string
  approving: string
  preparePlan: string
  preparing: string
  reject: string
  prepareMissingPlan: string
  proposedChanges: string
  validationSteps: string
  safetyControls: string
  approvedLabel: string
  currentVersion: string
  targetVersion: string
  noTargetVersion: string
  resolve: string
  ignore: string
  noRepo: string
  noAdvisory: string
  scanFailed: string
  monitorRequired: string
  monitorCreateFailed: string
  fixPlanFailed: string
  approveFailed: string
  pdfFailed: string
  remediationPrepared: string
  remediationApproved: string
  evidenceLabel: string
  expectedChange: string
  investigateChange: string
  escalateChange: string
  filters: Record<Filter, string>
  statuses: Record<string, string>
}

type CyberCopy = LegacyCyberCopy & ReturnType<typeof remediationAutonomyCopy> & ReturnType<typeof cyberReportPresentationCopy>

const COPY: Record<string, LegacyCyberCopy> = {
  en: {
    eyebrow: uiText('generatedUi.u_50ab62def34755ef'), title: uiText('generatedUi.u_2eb7bd7fb239f395'), subtitle: uiText('generatedUi.u_27c6e438141cfdfb'), auditCenter: uiText('generatedUi.u_369d154c24f90563'),
    repositoryUrl: uiText('generatedUi.u_c83db0133850dfcc'), repositoryPlaceholder: uiText('generatedUi.u_d7606d02f5e08d7c'), repositoryHint: uiText('generatedUi.u_7a1437c5697b689f'), monitorLabel: uiText('generatedUi.u_f3199d7cafa5b4a8'), monitorPlaceholder: uiText('generatedUi.u_d5935462be5e1b63'), frequency: uiText('generatedUi.u_16b6668d9831a1b8'), daily: uiText('generatedUi.u_b36c2611dcdfa190'), weekly: uiText('generatedUi.u_2975132481a7a695'), maxPackages: uiText('generatedUi.u_6180a0fd574a628a'), runScan: uiText('generatedUi.u_68ac7da5dfff2f8e'), scanning: uiText('generatedUi.u_38d96da6e8b253d2'), addMonitor: uiText('generatedUi.u_b4fbe7c430cd122e'), adding: uiText('generatedUi.u_c6de6f45c827f464'),
    openAlerts: uiText('generatedUi.u_10f2cf9aaec6a67f'), monitors: uiText('generatedUi.u_d2ea1516fbd01374'), enabled: uiText('generatedUi.u_92c1cdfdf4cb9cf6'), recentScans: uiText('generatedUi.u_ece88901c290694a'), awaitingApproval: uiText('generatedUi.u_ae25c9b1d366d159'), packages: uiText('generatedUi.u_40a2085371b8effb'), advisories: uiText('generatedUi.u_36fae4a9786f2381'), critical: uiText('generatedUi.u_427dd2969bd140be'), high: uiText('generatedUi.u_c4ebc6d4a5832cd9'), medium: uiText('generatedUi.u_8e588cd187741f1c'), low: uiText('generatedUi.u_f793de205ead5ac3'),
    prepareTitle: uiText('generatedUi.u_f241a35046471f55'), prepareDescription: uiText('generatedUi.u_fe405632fa51da96'), prepareFixPlan: uiText('generatedUi.u_06bdb72b10eeb93a'), preparingPlan: uiText('generatedUi.u_1cf36aaed33c8a90'),
    humanQueue: uiText('generatedUi.u_07d606f7b8490c2b'), humanEmpty: uiText('generatedUi.u_a2b2ee8b88b615d5'), alertInbox: uiText('generatedUi.u_480eb7465488a091'), noAlerts: uiText('generatedUi.u_429f36c929ca2a80'), monitoredRepositories: uiText('generatedUi.u_2546ff1fe783e1ae'), noMonitors: uiText('generatedUi.u_486cde08167c7931'), technicalTable: uiText('generatedUi.u_4755ba62e1c7389b'), noAdvisories: uiText('generatedUi.u_da91eb59c88325a4'), recentDependencyScans: uiText('generatedUi.u_d5da6f33428c256b'), noStoredScans: uiText('generatedUi.u_ff4f4124e4afb1a0'),
    repository: uiText('generatedUi.u_13d6ff07b8a5d792'), lastScan: uiText('generatedUi.u_bfe793712fde6870'), findings: uiText('generatedUi.u_e171c2ff25b55e5a'), status: "Status", action: uiText('generatedUi.u_64cff1319d2fd2cb'), notScannedYet: uiText('generatedUi.u_50e631f6283478f4'), disable: uiText('generatedUi.u_b7e3e4aa4257b9a1'), enable: uiText('generatedUi.u_5342e09f2729fbc6'), severity: uiText('generatedUi.u_5e9f98120dbe5682'), package: uiText('generatedUi.u_59de121db1b8145e'), advisory: uiText('generatedUi.u_c1dd64b75680d92a'), source: uiText('generatedUi.u_0e570ca6fabe24f9'), date: uiText('generatedUi.u_99c40ab405926cb5'), criticalHigh: uiText('generatedUi.u_3ec7fae060681bbc'), details: uiText('generatedUi.u_45989de49fb7f66d'),
    issueReviewReport: uiText('generatedUi.u_5121080342fbf888'), issueReviewTitle: uiText('generatedUi.u_4ef2f60d55e8fa11'), issueReviewSubtitle: uiText('generatedUi.u_fbc959c0443dbead'), issuesFound: uiText('generatedUi.u_ff9fbe06eab2fcb7'), affectedPackages: uiText('generatedUi.u_01bc9166c3821b16'), filesReferenced: uiText('generatedUi.u_20bed632588485ef'), whatWasFound: uiText('generatedUi.u_04e52f1fac5dee07'), whereFound: uiText('generatedUi.u_728d8580944e3dfb'), whyMatters: uiText('generatedUi.u_b8bda68d85740402'), recommendedNextStep: uiText('generatedUi.u_5330aed1b8685a57'), advisorySummary: uiText('generatedUi.u_da8a8ba58f27dd5b'), openAdvisory: uiText('generatedUi.u_78bf9afee77ff0e3'), downloadPdf: uiText('generatedUi.u_6183be0883d2a89c'), preparingPdf: uiText('generatedUi.u_ada4d2485dce4beb'), printSavePdf: uiText('generatedUi.u_bf7850226454a4d0'),
    planFirst: uiText('generatedUi.u_810bcb5bfa43282a'), yes: uiText('generatedUi.u_8a798890fe938171'), no: uiText('generatedUi.u_9390298f3fb0c5b1'), humanApproved: uiText('generatedUi.u_e3bee02722edac7c'), fixPlan: uiText('generatedUi.u_3bf14030f4d6e781'), notStarted: uiText('generatedUi.u_7a7400f466699598'), fixApproved: uiText('generatedUi.u_9e57d4ae164f9e87'), prPrepared: uiText('generatedUi.u_8ef06810279eb5bb'), viewPr: uiText('generatedUi.u_d9814dd06a364970'), approved: uiText('generatedUi.u_87b42e40c2a290e0'), rejected: uiText('generatedUi.u_aea4a04a80426ed8'), approvePlan: uiText('generatedUi.u_3cb71b35ce2418af'), approving: uiText('generatedUi.u_e99dcb0a97a2320d'), preparePlan: uiText('generatedUi.u_b91da1787e469a1f'), preparing: uiText('generatedUi.u_5d1fa38bcf0d88ca'), reject: uiText('generatedUi.u_ab604a360777735f'), prepareMissingPlan: uiText('generatedUi.u_9a1950ab63b3b5a8'), proposedChanges: uiText('generatedUi.u_486f49f03bf7117c'), validationSteps: uiText('generatedUi.u_44ec9da995430b08'), safetyControls: uiText('generatedUi.u_9a32e20ad7ebea07'), approvedLabel: uiText('generatedUi.u_87b42e40c2a290e0'), currentVersion: uiText('generatedUi.u_97b0560280ed60a5'), targetVersion: uiText('generatedUi.u_34a04005bcaf206e'), noTargetVersion: uiText('generatedUi.u_336dd7a295072e39'), resolve: uiText('generatedUi.u_c8f193b315c86f3a'), ignore: uiText('generatedUi.u_fce77c34d3fec987'), noRepo: uiText('generatedUi.u_f2d7948ef4890ffb'), noAdvisory: uiText('generatedUi.u_644c4a77ffa6df24'), scanFailed: uiText('generatedUi.u_c48ae960bad61189'), monitorRequired: uiText('generatedUi.u_f9a7b3acda9dd356'), monitorCreateFailed: uiText('generatedUi.u_0bf6926ce13a8925'), fixPlanFailed: uiText('generatedUi.u_3f63bd5441174e8e'), approveFailed: uiText('generatedUi.u_84a2e6d6100aa1b7'), pdfFailed: uiText('generatedUi.u_50ce04f6aec8e06b'), remediationPrepared: uiText('generatedUi.u_65329f78585736b5'), remediationApproved: uiText('generatedUi.u_ccfaf58bd8f54bda'),
    evidenceLabel: uiText('generatedUi.u_03867aea70acaf4c'), expectedChange: uiText('generatedUi.u_guardian_expected'), investigateChange: uiText('generatedUi.u_guardian_investigate'), escalateChange: uiText('generatedUi.u_guardian_escalate'), filters: { all: uiText('generatedUi.u_a52ace420f2175d0'), open: uiText('generatedUi.u_ed077f3d8125d60d'), resolved: uiText('generatedUi.u_5be3c2c8354e1eb9'), ignored: uiText('generatedUi.u_7d648f5b47f34afb') }, statuses: { awaiting_human_review: uiText('generatedUi.u_4848885e3fc43f6c'), approved: uiText('generatedUi.u_87b42e40c2a290e0'), rejected: uiText('generatedUi.u_aea4a04a80426ed8'), in_progress: uiText('generatedUi.u_c1f88e9d6c4145cf'), completed: uiText('generatedUi.u_22a970d2e5b1cc23'), cancelled: uiText('generatedUi.u_d353a99eb4556847'), open: uiText('generatedUi.u_ed077f3d8125d60d'), resolved: uiText('generatedUi.u_5be3c2c8354e1eb9'), ignored: uiText('generatedUi.u_7d648f5b47f34afb') },
  },
  es: { evidenceLabel: 'Evidencia', expectedChange: 'Esperado', investigateChange: 'Investigar', escalateChange: 'Escalar',
    eyebrow: 'Centro de Ciberseguridad', title: 'Monitoreo de avisos de dependencias', subtitle: 'Ejecuta análisis, monitorea repositorios, revisa problemas detectados, revisa el plan de corrección y luego aprueba o rechaza.', auditCenter: 'Centro de Auditoría', repositoryUrl: 'URL del repositorio', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: 'Repos públicos de GitHub por ahora. Los repos privados requieren OAuth de GitHub conectado.', monitorLabel: 'Etiqueta del monitor', monitorPlaceholder: 'Aplicación de producción', frequency: 'Frecuencia', daily: 'Diaria', weekly: 'Semanal', maxPackages: 'Máx. paquetes', runScan: 'Ejecutar análisis', scanning: 'Analizando…', addMonitor: 'Agregar monitor', adding: 'Agregando…', openAlerts: 'Alertas abiertas', monitors: 'Monitores', enabled: 'Activos', recentScans: 'Análisis recientes', awaitingApproval: 'Pendiente de aprobación', packages: 'Paquetes', advisories: 'Avisos', critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', prepareTitle: '¿Preparar un plan de corrección?', prepareDescription: 'Esto viene después del informe de revisión. SignalBoost preparará primero un plan propuesto. Nada cambia automáticamente. Un humano/admin debe revisar y aprobar el plan antes de preparar PR o cambiar código.', prepareFixPlan: 'Preparar plan', preparingPlan: 'Preparando plan…', humanQueue: 'Cola de aprobación humana', humanEmpty: 'Aún no hay planes de remediación. Después de que un informe encuentre problemas, los usuarios pueden pedir a SignalBoost que prepare un plan aquí.', alertInbox: 'Bandeja de alertas', noAlerts: 'Aún no hay alertas de ciberseguridad.', monitoredRepositories: 'Repositorios monitoreados', noMonitors: 'Aún no hay monitores. Agrega uno arriba para incluirlo en los análisis programados.', technicalTable: 'Tabla técnica de avisos', noAdvisories: 'No se encontraron avisos para las versiones exactas recopiladas.', recentDependencyScans: 'Análisis recientes de dependencias', noStoredScans: 'Aún no hay análisis guardados.', repository: 'Repositorio', lastScan: 'Último análisis', findings: 'Hallazgos', status: 'Estado', action: 'Acción', notScannedYet: 'Aún no analizado', disable: 'Desactivar', enable: 'Activar', severity: 'Severidad', package: 'Paquete', advisory: 'Aviso', source: 'Fuente', date: 'Fecha', criticalHigh: 'Crítico/Alto', details: 'Detalles', issueReviewReport: 'Informe de revisión', issueReviewTitle: 'Revisión de problemas de dependencias detectados', issueReviewSubtitle: 'SignalBoost revisó el resultado antes de ofrecer ayuda. Este informe explica qué se detectó, dónde, por qué importa y el siguiente paso recomendado. Aún no se ha solicitado ni aprobado ninguna corrección.', issuesFound: 'Problemas encontrados', affectedPackages: 'Paquetes afectados', filesReferenced: 'Archivos referenciados', whatWasFound: 'Qué se encontró', whereFound: 'Dónde se encontró', whyMatters: 'Por qué importa', recommendedNextStep: 'Siguiente paso recomendado', advisorySummary: 'Resumen del aviso:', openAdvisory: 'Abrir aviso', downloadPdf: 'Descargar PDF', preparingPdf: 'Preparando PDF…', printSavePdf: 'Imprimir / Guardar PDF', planFirst: 'Plan primero', yes: 'sí', no: 'no', humanApproved: 'Aprobado por humano', fixPlan: 'Plan de corrección', notStarted: 'no iniciado', fixApproved: 'Plan aprobado. La preparación del PR se ejecutará automáticamente cuando haya una actualización directa segura.', prPrepared: 'PR de GitHub preparado para revisión humana.', viewPr: 'Ver PR', approved: 'Aprobado', rejected: 'Rechazado', approvePlan: 'Aprobar plan', approving: 'Aprobando…', preparePlan: 'Preparar plan', preparing: 'Preparando…', reject: 'Rechazar', prepareMissingPlan: 'Preparar plan faltante', proposedChanges: 'Cambios propuestos', validationSteps: 'Pasos de validación', safetyControls: 'Controles de seguridad', approvedLabel: 'Aprobado', currentVersion: 'actual', targetVersion: 'objetivo', noTargetVersion: 'versión objetivo pendiente de confirmar', resolve: 'Resolver', ignore: 'Ignorar', noRepo: 'repo desconocido', noAdvisory: 'aviso', scanFailed: 'El análisis de ciberseguridad falló.', monitorRequired: 'Se requiere la URL del repositorio para agregar un monitor.', monitorCreateFailed: 'No se pudo agregar el monitor.', fixPlanFailed: 'No se pudo preparar el plan.', approveFailed: 'No se pudo aprobar el plan.', pdfFailed: 'No se pudo generar el PDF.', remediationPrepared: 'Plan preparado para revisión humana. Revisa el plan en la cola antes de aprobar.', remediationApproved: 'Plan aprobado. SignalBoost preparará un PR de GitHub automáticamente cuando sea seguro.', filters: { all: 'Todos', open: 'Abiertas', resolved: 'Resueltas', ignored: 'Ignoradas' }, statuses: { awaiting_human_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', in_progress: 'En progreso', completed: 'Completado', cancelled: 'Cancelado', open: 'Abierta', resolved: 'Resuelta', ignored: 'Ignorada' },
  },
  pt: { evidenceLabel: 'Evidência', expectedChange: 'Esperado', investigateChange: 'Investigar', escalateChange: 'Escalar',
    eyebrow: 'Centro de Cibersegurança', title: 'Monitoramento de Avisos de Dependências', subtitle: 'Execute análises, monitore repositórios, revise problemas detectados, revise o plano de correção e então aprove ou rejeite.', auditCenter: 'Centro de Auditoria', repositoryUrl: 'URL do repositório', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: 'Repos públicos do GitHub por enquanto. Repos privados exigem OAuth do GitHub conectado.', monitorLabel: 'Rótulo do monitor', monitorPlaceholder: 'Aplicativo de produção', frequency: 'Frequência', daily: 'Diária', weekly: 'Semanal', maxPackages: 'Máx. pacotes', runScan: 'Executar análise', scanning: 'Analisando…', addMonitor: 'Adicionar monitor', adding: 'Adicionando…', openAlerts: 'Alertas abertos', monitors: 'Monitores', enabled: 'Ativos', recentScans: 'Análises recentes', awaitingApproval: 'Aguardando aprovação', packages: 'Pacotes', advisories: 'Avisos', critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', prepareTitle: 'Preparar um plano de correção?', prepareDescription: 'Isso vem após a revisão do problema acima. O SignalBoost preparará primeiro um plano proposto. Nada será alterado automaticamente. Um humano/admin deve revisar e aprovar o plano antes da preparação de PR ou alteração de código.', prepareFixPlan: 'Preparar plano', preparingPlan: 'Preparando plano…', humanQueue: 'Fila de aprovação humana', humanEmpty: 'Ainda não há planos de remediação. Após um relatório encontrar problemas, usuários podem pedir ao SignalBoost para preparar um plano aqui.', alertInbox: 'Caixa de alertas', noAlerts: 'Ainda não há alertas de cibersegurança.', monitoredRepositories: 'Repositorios monitorados', noMonitors: 'Ainda não há monitores. Adicione um acima para incluí-lo nas verificações programadas.', technicalTable: 'Tabela técnica de avisos', noAdvisories: 'Nenhum aviso de dependência encontrado para as versões exatas coletadas.', recentDependencyScans: 'Análises recentes de dependências', noStoredScans: 'Ainda não há análises de cibersegurança salvas.', repository: 'Repositório', lastScan: 'Última análise', findings: 'Achados', status: 'Status', action: 'Ação', notScannedYet: 'Ainda não analisado', disable: 'Desativar', enable: 'Ativar', severity: 'Severidade', package: 'Pacote', advisory: 'Aviso', source: 'Fonte', date: 'Data', criticalHigh: 'Crítico/Alto', details: 'Detalhes', issueReviewReport: 'Relatório de revisão', issueReviewTitle: 'Revisão dos problemas de dependência detectados', issueReviewSubtitle: 'O SignalBoost revisou o resultado antes de oferecer ajuda. Este relatório explica o que foi detectado, onde foi encontrado, por que importa e o próximo passo recomendado. Nenhuma correção foi solicitada ou aprovada ainda.', issuesFound: 'Problemas encontrados', affectedPackages: 'Pacotes afetados', filesReferenced: 'Arquivos referenciados', whatWasFound: 'O que foi encontrado', whereFound: 'Onde foi encontrado', whyMatters: 'Por que importa', recommendedNextStep: 'Próximo passo recomendado', advisorySummary: 'Resumo do aviso:', openAdvisory: 'Abrir aviso', downloadPdf: 'Baixar PDF', preparingPdf: 'Preparando PDF…', printSavePdf: 'Imprimir / Salvar PDF', planFirst: 'Plano primeiro', yes: 'sim', no: 'não', humanApproved: 'Aprovado por humano', fixPlan: 'Plano de correção', notStarted: 'não iniciado', fixApproved: 'Plano aprovado. A preparação de PR será executada automaticamente quando houver uma atualização direta segura.', prPrepared: 'PR do GitHub preparado para revisão humana.', viewPr: 'Ver PR', approved: 'Aprovado', rejected: 'Rejeitado', approvePlan: 'Aprovar plano', approving: 'Aprovando…', preparePlan: 'Preparar plano', preparing: 'Preparando…', reject: 'Rejeitar', prepareMissingPlan: 'Preparar plano ausente', proposedChanges: 'Mudanças propostas', validationSteps: 'Etapas de validação', safetyControls: 'Controles de segurança', approvedLabel: 'Aprovado', currentVersion: 'atual', targetVersion: 'alvo', noTargetVersion: 'versão alvo pendente de confirmação', resolve: 'Resolver', ignore: 'Ignorar', noRepo: 'repo desconhecido', noAdvisory: 'aviso', scanFailed: 'A análise de cibersegurança falhou.', monitorRequired: 'A URL do repositório é obrigatória para adicionar um monitor.', monitorCreateFailed: 'Não foi possível adicionar o monitor.', fixPlanFailed: 'Não foi possível preparar o plano.', approveFailed: 'Não foi possível aprovar o plano.', pdfFailed: 'Não foi possível gerar o PDF.', remediationPrepared: 'Plano preparado para revisão humana. Revise o plano na fila antes de aprovar.', remediationApproved: 'Plano aprovado. O SignalBoost preparará um PR do GitHub automaticamente quando for seguro.', filters: { all: 'Todos', open: 'Abertos', resolved: 'Resolvidos', ignored: 'Ignorados' }, statuses: { awaiting_human_review: 'Em revisão', approved: 'Aprovado', rejected: 'Rejeitado', in_progress: 'Em andamento', completed: 'Concluído', cancelled: 'Cancelado', open: 'Aberto', resolved: 'Resolvido', ignored: 'Ignorado' },
  },
  pl: null as any,
  ru: null as any,
  de: {
    eyebrow: 'Cybersicherheitszentrum', title: 'Überwachung von Abhängigkeitswarnungen', subtitle: 'Führen Sie Scans aus, überwachen Sie Repositorys, prüfen Sie erkannte Probleme und den Korrekturplan und genehmigen oder lehnen Sie dann ab.', auditCenter: 'Audit-Center',
    repositoryUrl: 'Repository-URL', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: 'Öffentliche GitHub-Repos sind jetzt verfügbar. Für private Repos ist eine verbundene GitHub-OAuth erforderlich.', monitorLabel: 'Monitor-Bezeichnung', monitorPlaceholder: 'Produktiv-App', frequency: 'Häufigkeit', daily: 'Täglich', weekly: 'Wöchentlich', maxPackages: 'Max. Pakete', runScan: 'Scan ausführen', scanning: 'Wird gescannt…', addMonitor: 'Monitor hinzufügen', adding: 'Wird hinzugefügt…',
    openAlerts: 'Offene Warnungen', monitors: 'Monitore', enabled: 'Aktiviert', recentScans: 'Letzte Scans', awaitingApproval: 'Warten auf Freigabe', packages: 'Pakete', advisories: 'Hinweise', critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig',
    prepareTitle: 'Korrekturplan zur Überprüfung vorbereiten?', prepareDescription: 'Dies folgt auf die obige Problemprüfung. SignalBoost erstellt zuerst einen vorgeschlagenen Behebungsplan. Nichts wird automatisch geändert. Ein Mensch/Admin muss den Plan prüfen und genehmigen, bevor ein PR vorbereitet oder Code geändert wird.', prepareFixPlan: 'Korrekturplan vorbereiten', preparingPlan: 'Plan wird vorbereitet…',
    humanQueue: 'Warteschlange für menschliche Freigabe', humanEmpty: 'Noch keine Behebungspläne. Nachdem ein Bericht Probleme gefunden hat, können Benutzer SignalBoost bitten, hier einen Plan zur Prüfung vorzubereiten.', alertInbox: 'Benachrichtigungseingang', noAlerts: 'Noch keine Cybersicherheitswarnungen.', monitoredRepositories: 'Überwachte Repositorys', noMonitors: 'Noch keine Monitore. Fügen Sie oben einen hinzu, um ihn in geplante Cybersicherheitsprüfungen aufzunehmen.', technicalTable: 'Technische Beratungstabelle', noAdvisories: 'Für die in diesem Lauf erfassten exakten Versionen wurden keine Abhängigkeitshinweise gefunden.', recentDependencyScans: 'Aktuelle Abhängigkeitsscans', noStoredScans: 'Noch keine gespeicherten Cybersicherheits-Scans.',
    repository: 'Repository', lastScan: 'Letzter Scan', findings: 'Befunde', status: "Status", action: 'Aktion', notScannedYet: 'Noch nicht gescannt', disable: 'Deaktivieren', enable: 'Aktivieren', severity: 'Schweregrad', package: 'Paket', advisory: 'Beratung', source: 'Quelle', date: 'Datum', criticalHigh: 'Kritisch/Hoch', details: 'Details',
    issueReviewReport: 'Bericht zur Problemprüfung', issueReviewTitle: 'Prüfung erkannter Abhängigkeitsprobleme', issueReviewSubtitle: 'SignalBoost hat das Scanergebnis geprüft, bevor Hilfe angeboten wurde. Dieser Bericht erklärt, was erkannt wurde, wo es gefunden wurde, warum es wichtig ist und welcher nächste Schritt empfohlen wird. Es wurde noch keine Korrektur angefordert oder genehmigt.', issuesFound: 'Gefundene Probleme', affectedPackages: 'Betroffene Pakete', filesReferenced: 'Referenzierte Dateien', whatWasFound: 'Was gefunden wurde', whereFound: 'Fundort', whyMatters: 'Warum es wichtig ist', recommendedNextStep: 'Empfohlener nächster Schritt', advisorySummary: 'Zusammenfassung der Sicherheitshinweise:', openAdvisory: 'Hinweis öffnen', downloadPdf: 'PDF herunterladen', preparingPdf: 'PDF wird vorbereitet…', printSavePdf: 'Drucken / Als PDF speichern',
    planFirst: 'Zuerst planen', yes: 'ja', no: 'nein', humanApproved: 'Von Menschen genehmigt', fixPlan: 'Korrekturplan', notStarted: 'nicht gestartet', fixApproved: 'Behebungsplan genehmigt. Die PR-Vorbereitung läuft automatisch, sobald ein sicheres direktes Update verfügbar ist.', prPrepared: 'GitHub-PR für die manuelle Prüfung vorbereitet.', viewPr: 'PR anzeigen', approved: 'Genehmigt', rejected: 'Abgelehnt', approvePlan: 'Plan genehmigen', approving: 'Wird genehmigt…', preparePlan: 'Plan vorbereiten', preparing: 'Wird vorbereitet…', reject: 'Ablehnen', prepareMissingPlan: 'Fehlenden Plan vorbereiten', proposedChanges: 'Vorgeschlagene Änderungen', validationSteps: 'Validierungsschritte', safetyControls: 'Sicherheitskontrollen', approvedLabel: 'Genehmigt', currentVersion: 'aktuell', targetVersion: 'Ziel', noTargetVersion: 'Zielversion wartet auf Bestätigung', resolve: 'Lösen', ignore: 'Ignorieren', noRepo: 'Repository unbekannt', noAdvisory: 'beratend', scanFailed: 'Cybersicherheitsscan fehlgeschlagen.', monitorRequired: 'Zum Hinzufügen eines Monitors ist eine Repository-URL erforderlich.', monitorCreateFailed: 'Monitor konnte nicht hinzugefügt werden.', fixPlanFailed: 'Korrekturplan konnte nicht erstellt werden.', approveFailed: 'Der Korrekturplan konnte nicht genehmigt werden.', pdfFailed: 'PDF-Bericht konnte nicht erstellt werden.', remediationPrepared: 'Korrekturplan zur menschlichen Prüfung vorbereitet. Prüfen Sie den Plan in der Genehmigungswarteschlange, bevor Sie etwas genehmigen.', remediationApproved: 'Korrekturplan genehmigt. SignalBoost erstellt automatisch einen GitHub-PR, sobald das Update sicher ist.',
    evidenceLabel: 'Nachweise', expectedChange: 'Erwartet', investigateChange: 'Untersuchen', escalateChange: 'Eskalieren', filters: { all: 'Alle', open: 'Offen', resolved: 'Gelöst', ignored: 'Ignoriert' }, statuses: { awaiting_human_review: 'Wartet auf Prüfung', approved: 'Genehmigt', rejected: 'Abgelehnt', in_progress: 'In Bearbeitung', completed: 'Abgeschlossen', cancelled: 'Abgebrochen', open: 'Offen', resolved: 'Gelöst', ignored: 'Ignoriert' },
  },
  fr: {
    eyebrow: 'Centre de cybersécurité', title: 'Surveillance des avis de sécurité des dépendances', subtitle: 'Lancez des analyses, surveillez les dépôts, examinez les problèmes détectés et le plan de correction, puis approuvez ou refusez.', auditCenter: 'Centre d’audit',
    repositoryUrl: 'URL du dépôt', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: 'Dépôts GitHub publics dès maintenant. La prise en charge des dépôts privés nécessite une connexion GitHub OAuth.', monitorLabel: 'Libellé du moniteur', monitorPlaceholder: 'Application de production', frequency: 'Fréquence', daily: 'Quotidien', weekly: 'Hebdomadaire', maxPackages: 'Forfaits max.', runScan: 'Lancer l’analyse', scanning: 'Analyse en cours…', addMonitor: 'Ajouter un moniteur', adding: 'Ajout…',
    openAlerts: 'Alertes ouvertes', monitors: 'Moniteurs', enabled: 'Activé', recentScans: 'Analyses récentes', awaitingApproval: 'En attente d\'approbation', packages: 'Forfaits', advisories: 'Avis', critical: 'Critique', high: 'Élevé', medium: 'Moyen', low: 'Faible',
    prepareTitle: 'Préparer un plan de correction pour revue ?', prepareDescription: 'Cette étape suit l’examen du problème ci-dessus. SignalBoost préparera d’abord un plan de correction proposé. Rien ne sera modifié automatiquement. Un humain/administrateur doit examiner et approuver le plan avant la préparation d’une PR ou toute modification du code.', prepareFixPlan: 'Préparer le plan de correction', preparingPlan: 'Préparation du plan…',
    humanQueue: 'File d\'approbation humaine', humanEmpty: 'Aucun plan de remédiation pour l’instant. Lorsqu’un rapport détecte des problèmes, les utilisateurs peuvent demander à SignalBoost de préparer ici un plan à examiner.', alertInbox: 'Boîte de réception des alertes', noAlerts: 'Aucune alerte de cybersécurité pour l’instant.', monitoredRepositories: 'Dépôts surveillés', noMonitors: 'Aucun moniteur pour l’instant. Ajoutez-en un ci-dessus pour l’inclure dans les contrôles de cybersécurité planifiés.', technicalTable: 'Tableau consultatif technique', noAdvisories: 'Aucun avis de dépendance trouvé pour les versions exactes collectées lors de cette exécution.', recentDependencyScans: 'Analyses de dépendances récentes', noStoredScans: 'Aucune analyse de cybersécurité enregistrée pour l’instant.',
    repository: 'Dépôt', lastScan: 'Dernière analyse', findings: 'Constats', status: "Statut", action: 'Action', notScannedYet: 'Pas encore analysé', disable: 'Désactiver', enable: 'Activer', severity: 'Gravité', package: 'Forfait', advisory: 'Conseil', source: 'Source', date: 'Date', criticalHigh: 'Critique/Élevée', details: 'Détails',
    issueReviewReport: 'Rapport d’examen des problèmes', issueReviewTitle: 'Examen des problèmes de dépendances détectés', issueReviewSubtitle: 'SignalBoost a examiné le résultat de l\'analyse avant de proposer son aide. Ce rapport explique ce qui a été détecté, où, pourquoi c\'est important et la prochaine étape recommandée. Aucune correction n\'a encore été demandée ni approuvée.', issuesFound: 'Problèmes détectés', affectedPackages: 'Paquets concernés', filesReferenced: 'Fichiers référencés', whatWasFound: 'Ce qui a été trouvé', whereFound: 'Où il a été trouvé', whyMatters: 'Pourquoi c\'est important', recommendedNextStep: 'Étape suivante recommandée', advisorySummary: 'Résumé des avis :', openAdvisory: 'Ouvrir l\'avis', downloadPdf: 'Télécharger le PDF', preparingPdf: 'Préparation du PDF…', printSavePdf: 'Imprimer / Enregistrer en PDF',
    planFirst: 'Planifier d’abord', yes: 'oui', no: 'non', humanApproved: 'Approuvé par un humain', fixPlan: 'Plan de correction', notStarted: 'non démarré', fixApproved: 'Plan de correction approuvé. La préparation de la PR s\'exécutera automatiquement dès qu\'une mise à jour directe sûre sera disponible.', prPrepared: 'PR GitHub préparée pour une revue humaine.', viewPr: 'Voir la PR', approved: 'Approuvé', rejected: 'Rejeté', approvePlan: 'Approuver le plan', approving: 'Approbation…', preparePlan: 'Préparer le plan', preparing: 'Préparation…', reject: 'Rejeter', prepareMissingPlan: 'Préparer le plan manquant', proposedChanges: 'Modifications proposées', validationSteps: 'Étapes de validation', safetyControls: 'Contrôles de sécurité', approvedLabel: 'Approuvé', currentVersion: 'actuel', targetVersion: 'cible', noTargetVersion: 'version cible en attente de confirmation', resolve: 'Résoudre', ignore: 'Ignorer', noRepo: 'dépôt inconnu', noAdvisory: 'consultatif', scanFailed: 'L’analyse de cybersécurité a échoué.', monitorRequired: 'L\'URL du dépôt est requise pour ajouter un moniteur.', monitorCreateFailed: 'Impossible d\'ajouter le moniteur.', fixPlanFailed: 'Impossible de préparer le plan de correction.', approveFailed: 'Impossible d’approuver le plan de correction.', pdfFailed: 'Impossible de générer le rapport PDF.', remediationPrepared: 'Plan de correction préparé pour examen humain. Examinez le plan dans la file d’approbation avant d’approuver quoi que ce soit.', remediationApproved: 'Plan de correction approuvé. SignalBoost préparera automatiquement une PR GitHub lorsque la mise à jour sera sûre.',
    evidenceLabel: 'Preuves', expectedChange: 'Attendu', investigateChange: 'Enquêter', escalateChange: 'Escalader', filters: { all: 'Tous', open: 'Ouvert', resolved: 'Résolu', ignored: 'Ignoré' }, statuses: { awaiting_human_review: 'En attente de révision', approved: 'Approuvé', rejected: 'Rejeté', in_progress: 'En cours', completed: 'Terminé', cancelled: 'Annulé', open: 'Ouvert', resolved: 'Résolu', ignored: 'Ignoré' },
  },
  it: {
    eyebrow: 'Centro di cybersicurezza', title: 'Monitoraggio degli avvisi sulle dipendenze', subtitle: 'Esegui scansioni, monitora i repository, esamina i problemi rilevati e il piano di correzione, quindi approva o rifiuta.', auditCenter: 'Centro audit',
    repositoryUrl: 'URL del repository', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: 'Repository GitHub pubblici già disponibili. Il supporto ai repository privati richiede GitHub OAuth collegato.', monitorLabel: 'Etichetta del monitor', monitorPlaceholder: 'App di produzione', frequency: 'Frequenza', daily: 'Giornaliero', weekly: 'Settimanale', maxPackages: 'Pacchetti max', runScan: 'Esegui scansione', scanning: 'Scansione in corso…', addMonitor: 'Aggiungi monitor', adding: 'Aggiunta…',
    openAlerts: 'Avvisi aperti', monitors: 'Monitor', enabled: 'Abilitato', recentScans: 'Scansioni recenti', awaitingApproval: 'In attesa di approvazione', packages: 'Pacchetti', advisories: 'Avvisi', critical: 'Critico', high: 'Alto', medium: 'Medio', low: 'Bassa',
    prepareTitle: 'Preparare un piano di correzione da revisionare?', prepareDescription: 'Questo passaggio segue la revisione del problema qui sopra. SignalBoost preparerà prima un piano di correzione proposto. Nulla verrà modificato automaticamente. Una persona/un amministratore deve esaminare e approvare il piano prima della preparazione della PR o di qualsiasi modifica al codice.', prepareFixPlan: 'Prepara piano di correzione', preparingPlan: 'Preparazione del piano…',
    humanQueue: 'Coda di approvazione umana', humanEmpty: 'Ancora nessun piano di correzione. Quando un report rileva problemi, gli utenti possono chiedere a SignalBoost di preparare qui un piano da revisionare.', alertInbox: 'Casella degli avvisi', noAlerts: 'Ancora nessun avviso di sicurezza informatica.', monitoredRepositories: 'Repository monitorati', noMonitors: 'Nessun monitor ancora. Aggiungine uno sopra per includerlo nei controlli di cybersicurezza pianificati.', technicalTable: 'Tabella consultiva tecnica', noAdvisories: 'Nessun avviso sulle dipendenze trovato per le versioni esatte raccolte in questa esecuzione.', recentDependencyScans: 'Scansioni delle dipendenze recenti', noStoredScans: 'Nessuna scansione di sicurezza informatica salvata.',
    repository: 'Repository', lastScan: 'Ultima scansione', findings: 'Risultati', status: "Stato", action: 'Azione', notScannedYet: 'Non ancora scansionato', disable: 'Disattiva', enable: 'Abilita', severity: 'Gravità', package: 'Pacchetto', advisory: 'Consulenza', source: 'Sorgente', date: 'Data', criticalHigh: 'Critica/Alta', details: 'Dettagli',
    issueReviewReport: 'Report di revisione dei problemi', issueReviewTitle: 'Revisione dei problemi di dipendenza rilevati', issueReviewSubtitle: 'SignalBoost ha esaminato il risultato della scansione prima di offrire aiuto. Questo report spiega cosa è stato rilevato, dove è stato trovato, perché è importante e il passaggio successivo consigliato. Nessuna correzione è stata ancora richiesta o approvata.', issuesFound: 'Problemi rilevati', affectedPackages: 'Pacchetti interessati', filesReferenced: 'File referenziati', whatWasFound: 'Cosa è stato trovato', whereFound: 'Dove è stato trovato', whyMatters: 'Perché è importante', recommendedNextStep: 'Passaggio successivo consigliato', advisorySummary: 'Riepilogo degli avvisi:', openAdvisory: 'Apri avviso', downloadPdf: 'Scarica PDF', preparingPdf: 'Preparazione del PDF…', printSavePdf: 'Stampa / Salva PDF',
    planFirst: 'Prima pianifica', yes: 'sì', no: 'no', humanApproved: 'Approvato da una persona', fixPlan: 'Piano di correzione', notStarted: 'non avviato', fixApproved: 'Piano di correzione approvato. La preparazione della PR verrà eseguita automaticamente quando sarà disponibile un aggiornamento diretto sicuro.', prPrepared: 'PR GitHub preparata per la revisione umana.', viewPr: 'Visualizza PR', approved: 'Approvato', rejected: 'Rifiutato', approvePlan: 'Approva piano', approving: 'Approvazione in corso…', preparePlan: 'Prepara piano', preparing: 'Preparazione…', reject: 'Rifiuta', prepareMissingPlan: 'Prepara il piano mancante', proposedChanges: 'Modifiche proposte', validationSteps: 'Passaggi di convalida', safetyControls: 'Controlli di sicurezza', approvedLabel: 'Approvato', currentVersion: 'attuale', targetVersion: 'obiettivo', noTargetVersion: 'versione di destinazione in attesa di conferma', resolve: 'Risolvi', ignore: 'Ignora', noRepo: 'repository sconosciuto', noAdvisory: 'consultivo', scanFailed: 'Scansione di sicurezza informatica non riuscita.', monitorRequired: 'Per aggiungere un monitor è necessario l\'URL del repository.', monitorCreateFailed: 'Impossibile aggiungere il monitor.', fixPlanFailed: 'Impossibile preparare il piano di correzione.', approveFailed: 'Impossibile approvare il piano di correzione.', pdfFailed: 'Impossibile generare il report PDF.', remediationPrepared: 'Piano di correzione preparato per la revisione umana. Esamina il piano nella coda di approvazione prima di approvare qualsiasi cosa.', remediationApproved: 'Piano di correzione approvato. SignalBoost preparerà automaticamente una PR su GitHub quando l’aggiornamento sarà sicuro.',
    evidenceLabel: 'Prove', expectedChange: 'Previsto', investigateChange: 'Indaga', escalateChange: 'Inoltra', filters: { all: 'Tutti', open: 'Aperto', resolved: 'Risolto', ignored: 'Ignorato' }, statuses: { awaiting_human_review: 'In attesa di revisione', approved: 'Approvato', rejected: 'Rifiutato', in_progress: 'In corso', completed: 'Completato', cancelled: 'Annullato', open: 'Aperto', resolved: 'Risolto', ignored: 'Ignorato' },
  },
  ja: {
    eyebrow: 'サイバーセキュリティセンター', title: '依存関係アドバイザリーの監視', subtitle: 'スキャンを実行し、リポジトリを監視し、検出された問題と修正プランを確認してから、承認または却下してください。', auditCenter: '監査センター',
    repositoryUrl: 'リポジトリURL', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: '現在は公開 GitHub リポジトリに対応しています。非公開リポジトリには GitHub OAuth の接続が必要です。', monitorLabel: 'モニターラベル', monitorPlaceholder: '本番アプリ', frequency: '頻度', daily: '毎日', weekly: '毎週', maxPackages: '最大パッケージ数', runScan: 'スキャンを実行', scanning: 'スキャン中…', addMonitor: 'モニターを追加', adding: '追加中…',
    openAlerts: '未解決のアラート', monitors: 'モニター', enabled: '有効', recentScans: '最近のスキャン', awaitingApproval: '承認待ち', packages: 'パッケージ', advisories: 'アドバイザリー', critical: '重大', high: '高', medium: '中', low: '低',
    prepareTitle: 'レビュー用の修正プランを準備しますか？', prepareDescription: 'これは上記の問題レビューの後に行われます。SignalBoost はまず修正計画案を作成します。自動的に変更されるものはありません。PR の準備やコード変更の前に、担当者/管理者が計画を確認して承認する必要があります。', prepareFixPlan: '修正計画を準備', preparingPlan: 'プランを準備中…',
    humanQueue: '人による承認キュー', humanEmpty: '改善計画はまだありません。レポートで問題が見つかった後、ユーザーは SignalBoost にレビュー用の計画をここで作成するよう依頼できます。', alertInbox: 'アラート受信箱', noAlerts: 'サイバーセキュリティのアラートはまだありません。', monitoredRepositories: '監視対象リポジトリ', noMonitors: 'モニターはまだありません。上で追加すると、定期的なサイバーセキュリティチェックに含まれます。', technicalTable: '技術アドバイザリー表', noAdvisories: 'この実行で収集された正確なバージョンについて、依存関係のアドバイザリーは見つかりませんでした。', recentDependencyScans: '最近の依存関係スキャン', noStoredScans: '保存されたサイバーセキュリティスキャンはまだありません。',
    repository: 'リポジトリ', lastScan: '最終スキャン', findings: '検出結果', status: "ステータス", action: 'アクション', notScannedYet: '未スキャン', disable: '無効化', enable: '有効化', severity: '重大度', package: 'パッケージ', advisory: 'アドバイザリー', source: 'ソース', date: '日付', criticalHigh: '重大/高', details: '詳細',
    issueReviewReport: '問題レビューレポート', issueReviewTitle: '検出された依存関係の問題のレビュー', issueReviewSubtitle: 'SignalBoost は支援を提案する前にスキャン結果を確認しました。このレポートでは、検出された内容、検出場所、その重要性、推奨される次のステップを説明します。修正はまだリクエストも承認もされていません。', issuesFound: '検出された問題', affectedPackages: '影響を受けるパッケージ', filesReferenced: '参照ファイル', whatWasFound: '検出内容', whereFound: '検出場所', whyMatters: '重要な理由', recommendedNextStep: '推奨される次のステップ', advisorySummary: 'アドバイザリーの概要：', openAdvisory: 'アドバイザリーを開く', downloadPdf: 'PDF をダウンロード', preparingPdf: 'PDF を準備中…', printSavePdf: '印刷 / PDFを保存',
    planFirst: 'まず計画', yes: 'はい', no: 'いいえ', humanApproved: '人による承認済み', fixPlan: '修正計画', notStarted: '未開始', fixApproved: '修正プランが承認されました。安全な直接更新が利用可能になると、PR の準備が自動的に実行されます。', prPrepared: '人によるレビュー用に GitHub PR を準備しました。', viewPr: 'PR を表示', approved: '承認済み', rejected: '却下済み', approvePlan: '計画を承認', approving: '承認中…', preparePlan: '計画を準備', preparing: '準備中…', reject: '却下', prepareMissingPlan: '不足しているプランを準備', proposedChanges: '提案された変更', validationSteps: '検証ステップ', safetyControls: '安全管理', approvedLabel: '承認済み', currentVersion: '現在', targetVersion: 'ターゲット', noTargetVersion: '対象バージョンは確認待ち', resolve: '解決', ignore: '無視', noRepo: 'リポジトリ不明', noAdvisory: 'アドバイザリー', scanFailed: 'サイバーセキュリティスキャンに失敗しました。', monitorRequired: 'モニターを追加するにはリポジトリ URL が必要です。', monitorCreateFailed: 'モニターを追加できませんでした。', fixPlanFailed: '修正計画を準備できませんでした。', approveFailed: '修正計画を承認できませんでした。', pdfFailed: 'PDF レポートを生成できませんでした。', remediationPrepared: '人によるレビュー用に修正計画を準備しました。何かを承認する前に、承認キューで計画を確認してください。', remediationApproved: '修正プランが承認されました。更新が安全になった時点で、SignalBoost が GitHub PR を自動的に作成します。',
    evidenceLabel: '証拠', expectedChange: '想定どおり', investigateChange: '調査', escalateChange: 'エスカレート', filters: { all: 'すべて', open: 'オープン', resolved: '解決済み', ignored: '無視' }, statuses: { awaiting_human_review: 'レビュー待ち', approved: '承認済み', rejected: '却下済み', in_progress: '進行中', completed: '完了', cancelled: 'キャンセル済み', open: 'オープン', resolved: '解決済み', ignored: '無視' },
  },
  ko: {
    eyebrow: '사이버 보안 센터', title: '종속성 권고 모니터링', subtitle: '스캔을 실행하고, 저장소를 모니터링하고, 감지된 문제와 수정 계획을 검토한 다음 승인하거나 거부하세요.', auditCenter: '감사 센터',
    repositoryUrl: '저장소 URL', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: '현재 공개 GitHub 저장소를 지원합니다. 비공개 저장소를 지원하려면 GitHub OAuth를 연결해야 합니다.', monitorLabel: '모니터 레이블', monitorPlaceholder: '프로덕션 앱', frequency: '빈도', daily: '매일', weekly: '매주', maxPackages: '최대 패키지 수', runScan: '스캔 실행', scanning: '스캔 중…', addMonitor: '모니터 추가', adding: '추가하는 중…',
    openAlerts: '미해결 알림', monitors: '모니터', enabled: '사용', recentScans: '최근 스캔', awaitingApproval: '승인 대기 중', packages: '패키지', advisories: '권고 사항', critical: '심각', high: '높음', medium: '보통', low: '낮음',
    prepareTitle: '검토용 수정 계획을 준비할까요?', prepareDescription: '이 단계는 위의 이슈 검토 후에 진행됩니다. SignalBoost가 먼저 수정 계획안을 준비합니다. 자동으로 변경되는 것은 없습니다. PR 준비나 코드 변경 전에 사람/관리자가 계획을 검토하고 승인해야 합니다.', prepareFixPlan: '수정 계획 준비', preparingPlan: '계획 준비 중…',
    humanQueue: '사람 승인 대기열', humanEmpty: '아직 개선 계획이 없습니다. 보고서에서 문제가 발견되면 사용자가 SignalBoost에 검토용 계획을 여기에서 준비하도록 요청할 수 있습니다.', alertInbox: '알림 수신함', noAlerts: '아직 사이버 보안 알림이 없습니다.', monitoredRepositories: '모니터링 중인 저장소', noMonitors: '아직 모니터가 없습니다. 위에서 추가하면 예약된 사이버 보안 점검에 포함됩니다.', technicalTable: '기술 권고 표', noAdvisories: '이번 실행에서 수집한 정확한 버전에 대한 종속성 권고가 없습니다.', recentDependencyScans: '최근 종속성 스캔', noStoredScans: '저장된 사이버 보안 스캔이 아직 없습니다.',
    repository: '저장소', lastScan: '마지막 스캔', findings: '발견 사항', status: "상태", action: '작업', notScannedYet: '아직 스캔되지 않음', disable: '비활성화', enable: '사용', severity: '심각도', package: '패키지', advisory: '자문', source: '소스', date: '날짜', criticalHigh: '심각/높음', details: '세부 정보',
    issueReviewReport: '문제 검토 보고서', issueReviewTitle: '감지된 종속성 문제 검토', issueReviewSubtitle: 'SignalBoost는 도움을 제안하기 전에 스캔 결과를 검토했습니다. 이 보고서는 무엇이 감지되었는지, 어디에서 발견되었는지, 왜 중요한지, 권장되는 다음 단계를 설명합니다. 아직 요청되거나 승인된 수정 사항은 없습니다.', issuesFound: '발견된 문제', affectedPackages: '영향받는 패키지', filesReferenced: '참조된 파일', whatWasFound: '발견된 내용', whereFound: '발견된 위치', whyMatters: '중요한 이유', recommendedNextStep: '권장 다음 단계', advisorySummary: '권고 요약:', openAdvisory: '권고 열기', downloadPdf: 'PDF 다운로드', preparingPdf: 'PDF 준비 중…', printSavePdf: '인쇄 / PDF 저장',
    planFirst: '먼저 계획', yes: '예', no: '아니요', humanApproved: '사람이 승인함', fixPlan: '수정 계획', notStarted: '시작 안 됨', fixApproved: '수정 계획이 승인되었습니다. 안전한 직접 업데이트를 사용할 수 있게 되면 PR 준비가 자동으로 실행됩니다.', prPrepared: '사람의 검토를 위해 GitHub PR을 준비했습니다.', viewPr: 'PR 보기', approved: '승인됨', rejected: '거부됨', approvePlan: '계획 승인', approving: '승인 중…', preparePlan: '계획 준비', preparing: '준비 중…', reject: '거부', prepareMissingPlan: '누락된 계획 준비', proposedChanges: '제안된 변경 사항', validationSteps: '검증 단계', safetyControls: '안전 제어', approvedLabel: '승인됨', currentVersion: '현재', targetVersion: '대상', noTargetVersion: '대상 버전 확인 대기 중', resolve: '해결', ignore: '무시', noRepo: '리포지토리 알 수 없음', noAdvisory: '권고', scanFailed: '사이버 보안 스캔에 실패했습니다.', monitorRequired: '모니터를 추가하려면 리포지토리 URL이 필요합니다.', monitorCreateFailed: '모니터를 추가할 수 없습니다.', fixPlanFailed: '수정 계획을 준비할 수 없습니다.', approveFailed: '수정 계획을 승인할 수 없습니다.', pdfFailed: 'PDF 보고서를 생성할 수 없습니다.', remediationPrepared: '사람의 검토를 위한 수정 계획이 준비되었습니다. 승인하기 전에 승인 대기열에서 계획을 검토하세요.', remediationApproved: '수정 계획이 승인되었습니다. 업데이트가 안전해지면 SignalBoost가 GitHub PR을 자동으로 준비합니다.',
    evidenceLabel: '증거', expectedChange: '예상됨', investigateChange: '조사', escalateChange: '에스컬레이션', filters: { all: '전체', open: '열림', resolved: '해결됨', ignored: '무시됨' }, statuses: { awaiting_human_review: '검토 대기 중', approved: '승인됨', rejected: '거부됨', in_progress: '진행 중', completed: '완료됨', cancelled: '취소됨', open: '열림', resolved: '해결됨', ignored: '무시됨' },
  },
  ar: {
    eyebrow: 'مركز الأمن السيبراني', title: 'مراقبة تنبيهات التبعيات', subtitle: 'شغّل عمليات الفحص، وراقب المستودعات، وراجع المشكلات المكتشفة وخطة الإصلاح، ثم وافق أو ارفض.', auditCenter: 'مركز التدقيق',
    repositoryUrl: 'URL المستودع', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: 'مستودعات GitHub العامة متاحة الآن. يتطلب دعم المستودعات الخاصة ربط GitHub OAuth.', monitorLabel: 'تسمية المراقِب', monitorPlaceholder: 'تطبيق الإنتاج', frequency: 'التكرار', daily: 'يوميًا', weekly: 'أسبوعي', maxPackages: 'الحد الأقصى للحزم', runScan: 'تشغيل الفحص', scanning: 'جارٍ الفحص…', addMonitor: 'إضافة مراقب', adding: 'جارٍ الإضافة…',
    openAlerts: 'التنبيهات المفتوحة', monitors: 'أدوات المراقبة', enabled: 'مُفعّل', recentScans: 'عمليات الفحص الأخيرة', awaitingApproval: 'في انتظار الموافقة', packages: 'الباقات', advisories: 'التنبيهات الاستشارية', critical: 'حرج', high: 'مرتفع', medium: 'متوسط', low: 'منخفض',
    prepareTitle: 'هل تريد إعداد خطة إصلاح للمراجعة؟', prepareDescription: 'تأتي هذه الخطوة بعد مراجعة المشكلة أعلاه. سيُعِدّ SignalBoost أولًا خطة إصلاح مقترحة. لن يتغير أي شيء تلقائيًا. يجب على شخص/مسؤول مراجعة الخطة والموافقة عليها قبل إعداد PR أو إجراء أي تغيير في الكود.', prepareFixPlan: 'إعداد خطة الإصلاح', preparingPlan: 'جارٍ إعداد الخطة…',
    humanQueue: 'قائمة انتظار الموافقة البشرية', humanEmpty: 'لا توجد خطط معالجة بعد. بعد أن يكشف تقرير عن مشكلات، يمكن للمستخدمين أن يطلبوا من SignalBoost إعداد خطة لمراجعتها هنا.', alertInbox: 'صندوق التنبيهات', noAlerts: 'لا توجد تنبيهات للأمن السيبراني بعد.', monitoredRepositories: 'المستودعات المراقَبة', noMonitors: 'لا توجد أدوات مراقبة بعد. أضف واحدة أعلاه لتضمينها في فحوصات الأمن السيبراني المجدولة.', technicalTable: 'جدول الاستشارات التقنية', noAdvisories: 'لم يتم العثور على تنبيهات تبعيات للإصدارات الدقيقة التي تم جمعها في هذا التشغيل.', recentDependencyScans: 'عمليات فحص التبعيات الأخيرة', noStoredScans: 'لا توجد عمليات فحص أمن سيبراني مخزنة بعد.',
    repository: 'المستودع', lastScan: 'آخر فحص', findings: 'النتائج', status: "الحالة", action: 'الإجراء', notScannedYet: 'لم يُفحص بعد', disable: 'تعطيل', enable: 'تمكين', severity: 'الخطورة', package: 'الحزمة', advisory: 'استشارة', source: 'المصدر', date: 'التاريخ', criticalHigh: 'حرجة/عالية', details: 'التفاصيل',
    issueReviewReport: 'تقرير مراجعة المشكلات', issueReviewTitle: 'مراجعة مشكلات التبعيات المكتشفة', issueReviewSubtitle: 'راجع SignalBoost نتيجة الفحص قبل تقديم المساعدة. يوضح هذا التقرير ما تم اكتشافه، ومكان العثور عليه، وسبب أهميته، والخطوة التالية الموصى بها. لم يتم طلب أي إصلاح أو الموافقة عليه بعد.', issuesFound: 'المشكلات المكتشفة', affectedPackages: 'الحزم المتأثرة', filesReferenced: 'الملفات المشار إليها', whatWasFound: 'ما تم العثور عليه', whereFound: 'مكان العثور عليه', whyMatters: 'لماذا يهم ذلك', recommendedNextStep: 'الخطوة التالية الموصى بها', advisorySummary: 'ملخص التنبيهات:', openAdvisory: 'فتح التنبيه', downloadPdf: 'تنزيل PDF', preparingPdf: 'جارٍ تجهيز PDF…', printSavePdf: 'طباعة / حفظ PDF',
    planFirst: 'التخطيط أولًا', yes: 'نعم', no: 'لا', humanApproved: 'معتمد بشريًا', fixPlan: 'خطة الإصلاح', notStarted: 'لم يبدأ', fixApproved: 'تمت الموافقة على خطة الإصلاح. سيتم إعداد طلب PR تلقائيًا عند توفّر تحديث مباشر آمن.', prPrepared: 'تم إعداد طلب PR على GitHub للمراجعة البشرية.', viewPr: 'عرض PR', approved: 'تمت الموافقة', rejected: 'مرفوض', approvePlan: 'اعتماد الخطة', approving: 'جارٍ الموافقة…', preparePlan: 'إعداد الخطة', preparing: 'جارٍ التحضير…', reject: 'رفض', prepareMissingPlan: 'إعداد الخطة الناقصة', proposedChanges: 'التغييرات المقترحة', validationSteps: 'خطوات التحقق', safetyControls: 'ضوابط السلامة', approvedLabel: 'تمت الموافقة', currentVersion: 'الحالي', targetVersion: 'الهدف', noTargetVersion: 'الإصدار المستهدف بانتظار التأكيد', resolve: 'حل', ignore: 'تجاهل', noRepo: 'مستودع غير معروف', noAdvisory: 'استشاري', scanFailed: 'فشل فحص الأمن السيبراني.', monitorRequired: 'يلزم عنوان URL للمستودع لإضافة مراقِب.', monitorCreateFailed: 'تعذّرت إضافة المراقب.', fixPlanFailed: 'تعذّر إعداد خطة الإصلاح.', approveFailed: 'تعذّرت الموافقة على خطة الإصلاح.', pdfFailed: 'تعذّر إنشاء تقرير PDF.', remediationPrepared: 'تم إعداد خطة الإصلاح للمراجعة البشرية. راجع الخطة في قائمة انتظار الموافقات قبل اعتماد أي شيء.', remediationApproved: 'تمت الموافقة على خطة الإصلاح. سيُعدّ SignalBoost طلب PR على GitHub تلقائيًا عندما يكون التحديث آمنًا.',
    evidenceLabel: 'الأدلة', expectedChange: 'متوقع', investigateChange: 'تحقيق', escalateChange: 'تصعيد', filters: { all: 'الكل', open: 'مفتوح', resolved: 'تم الحل', ignored: 'تم التجاهل' }, statuses: { awaiting_human_review: 'بانتظار المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'تم الإلغاء', open: 'مفتوح', resolved: 'تم الحل', ignored: 'تم التجاهل' },
  },
}
COPY.pl = COPY.en
COPY.ru = COPY.en

const sevClass: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/10 text-red-200',
  high: 'border-orange-400/40 bg-orange-400/10 text-orange-200',
  medium: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-100',
  low: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-100',
  unknown: 'border-white/15 bg-white/5 text-white/60',
}

const statusClass: Record<string, string> = {
  awaiting_human_review: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-100',
  approved: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  in_progress: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-100',
  completed: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  rejected: 'border-red-400/35 bg-red-400/10 text-red-100',
  cancelled: 'border-white/15 bg-white/5 text-white/60',
}

function copyFor(lang: string): LegacyCyberCopy { return COPY[lang] || COPY.en }
function safeDate(value?: string | null) { return value ? new Date(value).toLocaleString() : '' }

export default function CybersecurityCenterPage() {
  const { t, lang } = useTranslation()
  const baseCopy = copyFor(lang)
  const tr = (key: keyof LegacyCyberCopy, fallback: string) => t(`cybersecurity.${String(key)}`, fallback)
  const copy: CyberCopy = { ...baseCopy, eyebrow: tr("eyebrow", baseCopy.eyebrow), title: tr("title", baseCopy.title), ...remediationAutonomyCopy(lang), ...cyberReportPresentationCopy(lang) }

  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [maxPackages, setMaxPackages] = useState(120)
  const [loading, setLoading] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [remediationLoading, setRemediationLoading] = useState(false)
  const [planLoadingId, setPlanLoadingId] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remediationMessage, setRemediationMessage] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [scanId, setScanId] = useState<string | null>(null)
  const [history, setHistory] = useState<ScanRow[]>([])
  const [monitors, setMonitors] = useState<MonitorRow[]>([])
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [remediationRequests, setRemediationRequests] = useState<RemediationRequest[]>([])
  const [activity, setActivity] = useState<CyberActivityState | null>(null)

  async function loadDashboard() {
    try {
      const res = await fetch('/api/hub/cyber/dependencies', { credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setHistory(json.scans || [])
        setMonitors(json.monitors || [])
        setAlerts(json.alerts || [])
        setRemediationRequests(json.remediationRequests || [])
      }
    } catch { /* optional */ }
  }

  useEffect(() => { loadDashboard() }, [])

  async function runScan(scanUrl?: string) {
    if (scanUrl) setUrl(scanUrl)
    const startedAt = new Date().toISOString()
    setLoading(true)
    setError(null)
    setRemediationMessage(null)
    setReport(null)
    setScanId(null)
    setActivity({ operation: 'dependency_scan', status: 'running', stage: 'starting', progress: 4, startedAt, updatedAt: startedAt, stageChangedAt: startedAt })
    try {
      const res = await fetch('/api/hub/cyber/dependencies', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({ url: scanUrl || url.trim(), maxPackages, stream: true }),
      })
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error || copy.scanFailed)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let completed = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')
          if (!line) continue
          let event: any
          try { event = JSON.parse(line) } catch { continue }
          const at = String(event.at || new Date().toISOString())
          if (event.type === 'progress' || event.type === 'heartbeat') {
            setActivity(current => {
              const previousStage = current?.stage || 'starting'
              const nextStage = String(event.stage || previousStage)
              return {
                operation: 'dependency_scan',
                status: 'running',
                stage: nextStage,
                progress: Number(event.progress ?? current?.progress ?? 4),
                message: String(event.message || current?.message || ''),
                startedAt: current?.startedAt || startedAt,
                updatedAt: at,
                stageChangedAt: nextStage === previousStage ? (current?.stageChangedAt || startedAt) : at,
                done: typeof event.done === 'number' ? event.done : current?.done,
                total: typeof event.total === 'number' ? event.total : current?.total,
              }
            })
          } else if (event.type === 'complete') {
            completed = true
            setReport(event.report as Report)
            setScanId(event.scanId || null)
            setActivity(current => ({ operation: 'dependency_scan', status: 'completed', stage: 'complete', progress: 100, message: String(event.message || ''), startedAt: current?.startedAt || startedAt, updatedAt: at, stageChangedAt: at, done: event.report?.summary?.packagesScanned, total: event.report?.summary?.packagesScanned }))
          } else if (event.type === 'error') {
            throw new Error(String(event.error || copy.scanFailed))
          }
        }
      }
      if (!completed) throw new Error(copy.scanFailed)
      await loadDashboard()
    } catch (err) {
      const message = err instanceof Error ? err.message : copy.scanFailed
      setError(message)
      const at = new Date().toISOString()
      setActivity(current => ({ operation: 'dependency_scan', status: 'failed', stage: 'failed', progress: current?.progress || 0, message, error: message, startedAt: current?.startedAt || startedAt, updatedAt: at, stageChangedAt: at }))
    } finally { setLoading(false) }
  }

  async function addMonitor() {
    const repoUrl = url.trim()
    if (!repoUrl) { setError(copy.monitorRequired); return }
    setMonitoring(true)
    setError(null)
    try {
      const res = await fetch('/api/hub/cyber/dependencies', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_monitor', url: repoUrl, label: label.trim(), frequency }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || copy.monitorCreateFailed); return }
      setLabel('')
      await loadDashboard()
    } catch (err) { setError(err instanceof Error ? err.message : copy.monitorCreateFailed) }
    finally { setMonitoring(false) }
  }

  async function requestRemediation() {
    if (!report || report.advisories.length === 0) return
    setRemediationLoading(true)
    setError(null)
    setRemediationMessage(null)
    try {
      const res = await fetch('/api/hub/cyber/dependencies', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request_remediation', scanId }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || copy.fixPlanFailed); return }
      setRemediationMessage(copy.remediationPrepared)
      await loadDashboard()
      if (json.remediationRequest?.id) await runRoutinePreparation(json.remediationRequest.id)
    } catch (err) { setError(err instanceof Error ? err.message : copy.fixPlanFailed) }
    finally { setRemediationLoading(false) }
  }

  async function runRoutinePreparation(id: string) {
    setPlanLoadingId(id)
    try {
      const res = await fetch('/api/hub/cyber/prepare-github-pr', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remediationId: id }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) setError(json?.error || copy.fixPlanFailed)
      await loadDashboard()
    } catch (err) { setError(err instanceof Error ? err.message : copy.fixPlanFailed) }
    finally { setPlanLoadingId(null) }
  }

  async function downloadIssuePdf() {
    if (!report) return
    setPdfLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/hub/cyber/report-pdf', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report }) })
      if (!res.ok) { const json = await res.json().catch(() => null); setError(json?.error || copy.pdfFailed); return }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const repoName = String(report.repo || report.target || 'cybersecurity-report').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'cybersecurity-report'
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${repoName}-issue-review-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) { setError(err instanceof Error ? err.message : copy.pdfFailed) }
    finally { setPdfLoading(false) }
  }

  function printIssueReview() { window.print() }

  async function prepareFixPlan(id: string) {
    setPlanLoadingId(id)
    setError(null)
    try {
      const res = await fetch('/api/hub/cyber/dependencies', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare_fix_plan', remediationId: id }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || copy.fixPlanFailed); return }
      await loadDashboard()
    } catch (err) { setError(err instanceof Error ? err.message : copy.fixPlanFailed) }
    finally { setPlanLoadingId(null) }
  }

  async function approveFixPlan(id: string) {
    setPlanLoadingId(id)
    setError(null)
    setRemediationMessage(null)
    try {
      const res = await fetch('/api/hub/cyber/approve-and-prepare', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remediationId: id }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || copy.approveFailed); return }
      setRemediationMessage(copy.remediationApproved)
      await loadDashboard()
    } catch (err) { setError(err instanceof Error ? err.message : copy.approveFailed) }
    finally { setPlanLoadingId(null) }
  }

  async function updateRemediation(id: string, status: RemediationRequest['status'], disposition?: string) {
    setPlanLoadingId(id)
    setError(null)
    try {
      const res = await fetch('/api/hub/cyber/dependencies', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remediationId: id, status, approvalNotes: disposition }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || 'Could not record review disposition.'); return }
      await loadDashboard()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not record review disposition.') }
    finally { setPlanLoadingId(null) }
  }

  async function resolveAlert(id: string, status: 'resolved' | 'ignored' = 'resolved') {
    try {
      await fetch('/api/hub/cyber/dependencies', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alertId: id, status }) })
      await loadDashboard()
    } catch { /* non-critical */ }
  }

  async function toggleMonitor(id: string, isEnabled: boolean) {
    try {
      await fetch('/api/hub/cyber/dependencies', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monitorId: id, isEnabled }) })
      await loadDashboard()
    } catch { /* non-critical */ }
  }

  const summary = report?.summary
  const unknownAdvisories = report ? unclassifiedAdvisoryCount(report.advisories) : 0
  const openAlerts = alerts.filter(a => a.status === 'open')
  const { pending: pendingRemediation, active: activeRemediation, history: remediationHistory } = partitionRemediationRequests(remediationRequests)

  return (
    <main className="min-h-[calc(100vh-80px)] bg-bg px-6 pb-16 pt-8 font-sans text-text">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">{copy.eyebrow}</div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">{copy.title}</h1>
            <p className="mt-1.5 max-w-[760px] text-sm leading-relaxed text-text-muted">{copy.subtitle}</p>
          </div>
          <a href="/dashboard/audit" className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-muted hover:text-text">{copy.auditCenter}</a>
        </header>

        <section className="rounded-md border border-border bg-surface p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_190px_150px_auto_auto] lg:items-end">
            <label className="flex flex-col gap-1.5"><span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.repositoryUrl}</span><input value={url} onChange={e => setUrl(e.target.value)} placeholder={copy.repositoryPlaceholder} className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" /><span className="text-[10.5px] text-text-muted/80">{copy.repositoryHint}</span></label>
            <label className="flex flex-col gap-1.5"><span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.monitorLabel}</span><input value={label} onChange={e => setLabel(e.target.value)} placeholder={copy.monitorPlaceholder} className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.frequency}</span><select value={frequency} onChange={e => setFrequency(e.target.value === 'weekly' ? 'weekly' : 'daily')} className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"><option value="daily">{copy.daily}</option><option value="weekly">{copy.weekly}</option></select></label>
            <label className="flex flex-col gap-1.5"><span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.maxPackages}</span><input type="number" min={1} max={250} value={maxPackages} onChange={e => setMaxPackages(Math.max(1, Math.min(250, Number(e.target.value) || 1)))} className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" /></label>
            <div className="flex flex-wrap gap-2"><button onClick={() => runScan()} disabled={loading} className="rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-60">{loading ? copy.scanning : copy.runScan}</button><button onClick={addMonitor} disabled={monitoring} className="rounded-md border border-border bg-bg px-4 py-2 text-sm font-semibold text-text hover:bg-surface disabled:opacity-60">{monitoring ? copy.adding : copy.addMonitor}</button></div>
          </div>
        </section>

        <CyberActivityPanel activity={activity} lang={lang} />

        {error ? <div className="mt-4 rounded-md border border-danger bg-surface p-4 text-sm text-danger">{cyberProductText(error)}</div> : null}
        {remediationMessage ? <div className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">{cyberProductText(remediationMessage)}</div> : null}

        <section className="mt-5 grid gap-3 md:grid-cols-5"><Metric label={copy.openAlerts} value={openAlerts.length} tone={openAlerts.some(a => a.severity === 'critical') ? 'critical' : openAlerts.length ? 'high' : undefined} /><Metric label={copy.monitors} value={monitors.length} /><Metric label={copy.enabled} value={monitors.filter(m => m.is_enabled).length} /><Metric label={copy.recentScans} value={history.length} /><Metric label={copy.awaitingApproval} value={pendingRemediation.length} tone={pendingRemediation.length ? 'medium' : undefined} /></section>
        {summary ? <section className="mt-5 grid gap-3 md:grid-cols-6"><Metric label={copy.packages} value={summary.packagesScanned} /><Metric label={copy.advisories} value={summary.advisories} /><Metric label={copy.critical} value={summary.critical} tone="critical" /><Metric label={copy.high} value={summary.high} tone="high" /><Metric label={copy.medium} value={summary.medium} tone="medium" /><Metric label={copy.low} value={summary.low} tone="low" /><Metric label={copy.unknownSeverity} value={unknownAdvisories} tone={unknownAdvisories ? 'medium' : undefined} /></section> : null}

        {report && report.advisories.length > 0 ? <IssueReviewReport report={report} onDownloadPdf={downloadIssuePdf} onPrint={printIssueReview} pdfLoading={pdfLoading} copy={copy} /> : null}
        {report && report.advisories.length > 0 ? <section className="mt-5 rounded-md border border-accent/40 bg-accent/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-text">{copy.prepareTitle}</h2><p className="mt-1 max-w-[760px] text-sm leading-relaxed text-text-muted">{copy.prepareDescription}</p></div><button onClick={requestRemediation} disabled={remediationLoading} className="rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-60">{remediationLoading ? copy.preparingPlan : copy.prepareFixPlan}</button></div></section> : null}

        <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.humanQueue}</h2>{pendingRemediation.length === 0 ? <p className="text-sm text-text-muted">{copy.humanEmpty}</p> : <div className="flex flex-col gap-3">{pendingRemediation.slice(0, 20).map(r => <RemediationCard key={r.id} r={r} loading={loading || planLoadingId === r.id} onApprove={() => approveFixPlan(r.id)} onReject={() => updateRemediation(r.id, 'rejected')} onDisposition={(status, disposition) => updateRemediation(r.id, status, disposition)} onPreparePlan={() => prepareFixPlan(r.id)} onReassess={() => { const target = dependencyRescanUrl(r); if (target) void runScan(target) }} copy={copy} />)}</div>}</section>
        {activeRemediation.length > 0 ? <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.activeWork}</h2>{activeRemediation.length === 0 ? <p className="text-sm text-text-muted">{copy.humanEmpty}</p> : <div className="flex flex-col gap-3">{activeRemediation.slice(0, 20).map(r => <RemediationCard key={r.id} r={r} loading={loading || planLoadingId === r.id} onApprove={() => approveFixPlan(r.id)} onReject={() => updateRemediation(r.id, 'rejected')} onDisposition={(status, disposition) => updateRemediation(r.id, status, disposition)} onPreparePlan={() => runRoutinePreparation(r.id)} onReassess={() => { const target = dependencyRescanUrl(r); if (target) void runScan(target) }} copy={copy} />)}</div>}</section> : null}
        {remediationHistory.length > 0 ? <details className="mt-5 rounded-md border border-border bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold text-text">{copy.reviewHistory}</summary>{remediationHistory.length === 0 ? <p className="text-sm text-text-muted">{copy.humanEmpty}</p> : <div className="flex flex-col gap-3">{remediationHistory.slice(0, 20).map(r => <RemediationCard key={r.id} r={r} loading={loading || planLoadingId === r.id} onApprove={() => approveFixPlan(r.id)} onReject={() => updateRemediation(r.id, 'rejected')} onDisposition={(status, disposition) => updateRemediation(r.id, status, disposition)} onPreparePlan={() => prepareFixPlan(r.id)} onReassess={() => { const target = dependencyRescanUrl(r); if (target) void runScan(target) }} copy={copy} />)}</div>}</details> : null}
        <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.alertInbox}</h2>{alerts.length === 0 ? <p className="text-sm text-text-muted">{copy.noAlerts}</p> : <div className="flex flex-col gap-3">{alerts.slice(0, 20).map(a => <div key={a.id} className="rounded-md border border-border bg-bg p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{copy.statuses[a.severity] || a.severity}</span><span className="text-sm font-semibold text-text">{a.title}</span><span className="rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-text-muted">{copy.statuses[a.status] || a.status}</span></div><p className="mt-2 text-sm text-text-muted">{a.message}</p><p className="mt-1 text-xs text-text-muted/80">{a.repo || copy.noRepo} · {a.advisory_id || copy.noAdvisory} · {safeDate(a.created_at)}</p>{a.details_url ? <a className="mt-1 inline-block text-xs font-semibold text-accent" href={a.details_url} target="_blank" rel="noreferrer">{copy.details} →</a> : null}</div>{a.status === 'open' ? <div className="flex gap-2"><button onClick={() => resolveAlert(a.id, 'resolved')} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">{copy.resolve}</button><button onClick={() => resolveAlert(a.id, 'ignored')} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">{copy.ignore}</button></div> : null}</div></div>)}</div>}</section>
        <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.monitoredRepositories}</h2><p className="mb-3 text-xs text-text-muted">{copy.monitorSeverityNotice}</p>{monitors.length === 0 ? <p className="text-sm text-text-muted">{copy.noMonitors}</p> : <div className="overflow-x-auto"><table className="w-full border-collapse text-start text-sm"><thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">{copy.repository}</th><th className="border-b border-border p-3">{copy.frequency}</th><th className="border-b border-border p-3">{copy.lastScan}</th><th className="border-b border-border p-3">{copy.findings}</th><th className="border-b border-border p-3">{copy.status}</th><th className="border-b border-border p-3">{copy.action}</th></tr></thead><tbody>{monitors.map(m => <tr key={m.id} className="border-b border-border/70"><td className="p-3 text-text"><div className="font-semibold">{m.label || m.repo || m.repo_url}</div><div className="text-xs text-text-muted">{m.repo_url}</div></td><td className="p-3 text-text-muted">{m.frequency}</td><td className="p-3 text-text-muted">{m.last_scan_at ? safeDate(m.last_scan_at) : copy.notScannedYet}</td><td className="p-3 text-text-muted">{m.last_advisories} · {m.last_critical}/{m.last_high}</td><td className="p-3 text-text-muted">{m.is_enabled ? copy.enabled : copy.disable}{m.last_error ? ` · ${m.last_error}` : ''}</td><td className="p-3"><button onClick={() => toggleMonitor(m.id, !m.is_enabled)} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">{m.is_enabled ? copy.disable : copy.enable}</button></td></tr>)}</tbody></table></div>}</section>
        {report ? <section className="mt-5 rounded-md border border-border bg-surface p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-text">{copy.technicalTable}</h2><p className="text-xs text-text-muted">{report.repo || report.target} · {report.branch || uiText('generatedUi.u_37a8eec1ce19687d')} · {safeDate(report.generatedAt)}</p></div></div>{report.advisories.length === 0 ? <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">{copy.noAdvisories}</div> : <div className="overflow-x-auto"><table className="w-full border-collapse text-start text-sm"><thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">{copy.severity}</th><th className="border-b border-border p-3">{copy.package}</th><th className="border-b border-border p-3">{copy.advisory}</th><th className="border-b border-border p-3">{copy.source}</th></tr></thead><tbody>{report.advisories.map(a => <tr key={`${a.id}:${a.packageName}:${a.version}`} className="border-b border-border/70"><td className="p-3"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{copy.statuses[a.severity] || a.severity}</span></td><td className="p-3 text-text"><div className="font-semibold">{a.packageName}</div><div className="text-xs text-text-muted">{a.version}</div></td><td className="p-3 text-text-muted"><div className="font-semibold text-text">{a.id}</div><div>{a.summary}</div>{a.detailsUrl ? <a className="mt-1 inline-block text-accent" href={a.detailsUrl} target="_blank" rel="noreferrer">{copy.details} →</a> : null}</td><td className="p-3 text-xs text-text-muted">{a.sourceFile}</td></tr>)}</tbody></table></div>}</section> : null}
        <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.recentDependencyScans}</h2>{history.length === 0 ? <p className="text-sm text-text-muted">{copy.noStoredScans}</p> : <div className="overflow-x-auto"><table className="w-full border-collapse text-start text-sm"><thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">{copy.date}</th><th className="border-b border-border p-3">{copy.repository}</th><th className="border-b border-border p-3">{copy.packages}</th><th className="border-b border-border p-3">{copy.advisories}</th><th className="border-b border-border p-3">{copy.criticalHigh}</th><th className="border-b border-border p-3">{copy.unknownSeverity}</th></tr></thead><tbody>{history.map(h => <tr key={h.id} className="border-b border-border/70"><td className="p-3 text-text-muted">{safeDate(h.created_at)}</td><td className="p-3 text-text">{h.repo || h.target}</td><td className="p-3 text-text-muted">{h.packages_scanned}</td><td className="p-3 text-text-muted">{h.advisories_count}</td><td className="p-3 text-text-muted">{h.critical}/{h.high}</td><td className="p-3 text-text-muted">{Number.isFinite(h.unknown) ? h.unknown : copy.unavailable}</td></tr>)}</tbody></table></div>}</section>
      </div>
    </main>
  )
}

function RemediationCard({ r, loading, onApprove, onReject, onDisposition, onPreparePlan, onReassess, copy }: { r: RemediationRequest; loading: boolean; onApprove: () => void; onReject: () => void; onDisposition: (status: RemediationRequest['status'], disposition: string) => void; onPreparePlan: () => void; onReassess: () => void; copy: CyberCopy }) {
  const plan = r.fix_plan || null
  const hasPlan = !!(plan && Object.keys(plan).length > 0 && r.fix_plan_status && r.fix_plan_status !== 'not_started')
  const reviewOnly = r.source_type === 'guardian_repository_change'
  const dependency = r.source_area === 'cybersecurity' && r.source_type === 'dependency_scan'
  const historicalDependency = dependency && r.human_approval_required !== false
  const terminal = isTerminalRemediation(r)
  const preparationAuthorized = r.human_approval_required === false || (r.status === 'approved' && r.human_approved === true && r.fix_plan_approved === true)
  const guardianFinding = reviewOnly ? r.findings?.[0] : null
  return <div className="rounded-md border border-border bg-bg p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass[r.status] || statusClass.cancelled}`}>{copy.statuses[r.status] || r.status.replaceAll('_', ' ')}</span><span className="text-sm font-semibold text-text">{cyberProductText(r.title)}</span></div><p className="mt-2 text-sm text-text-muted">{historicalDependency ? copy.savedPlanNotice : cyberProductText(r.summary)}</p>{!historicalDependency && terminal ? <p className="mt-2 text-xs text-text-muted" data-cyber-brand-notice>{copy.brandDisplayNotice}</p> : null}{guardianFinding ? <div className="mt-3 rounded-md border border-yellow-400/30 bg-yellow-400/10 p-3 text-xs text-text-muted"><div className="font-semibold text-text">{cyberProductText(guardianFinding.summary)}</div><div className="mt-1">{(guardianFinding.sensitivePaths || []).join(', ')}</div><div className="mt-1 break-all">{copy.evidenceLabel}: {guardianFinding.evidenceReference}</div>{plan?.nextStep ? <div className="mt-2">{cyberProductText(plan.nextStep)}</div> : null}</div> : null}<p className="mt-1 text-xs text-text-muted/80">{r.repo || r.target || copy.noRepo} · {safeDate(r.created_at)}</p><p className="mt-1 text-xs text-text-muted/80">{copy.planFirst}: {hasPlan ? copy.yes : copy.no} · {r.human_approved ? `${copy.humanApproved}: ${copy.yes}` : needsHumanApproval(r) ? `${copy.humanApproved}: ${copy.no}` : copy.approvalNotRequired} · {copy.fixPlan}: {r.fix_plan_status || copy.notStarted}</p>{historicalDependency ? <details className="mt-3 rounded-md border border-border p-3" data-cyber-saved-plan><summary className="cursor-pointer text-xs font-semibold text-text">{copy.savedPlanArchive}</summary><p className="mt-2 text-xs text-text-muted" data-cyber-brand-notice>{copy.brandDisplayNotice}</p><p className="mt-2 text-sm text-text-muted">{cyberProductText(r.summary)}</p>{hasPlan ? <FixPlanView plan={plan as FixPlan} status={r.fix_plan_status || 'ready_for_review'} approved={!!r.fix_plan_approved} approvalRequired={needsHumanApproval(r)} historical copy={copy} /> : null}{r.implementation_notes ? <p className="mt-2 text-xs text-text-muted">{cyberProductText(r.implementation_notes)}</p> : null}</details> : <>{hasPlan && !reviewOnly ? <FixPlanView plan={plan as FixPlan} status={r.fix_plan_status || 'ready_for_review'} approved={!!r.fix_plan_approved} approvalRequired={needsHumanApproval(r)} copy={copy} /> : null}{r.implementation_notes ? <p className="mt-2 text-xs text-text-muted">{cyberProductText(r.implementation_notes)}</p> : null}</>}{r.pull_request_url ? <div className="mt-3 rounded-md border border-emerald-400/35 bg-emerald-400/10 p-3 text-sm text-emerald-100">{copy.prPrepared} <a className="font-semibold underline" href={r.pull_request_url} target="_blank" rel="noreferrer">{copy.viewPr} →</a></div> : preparationAuthorized && r.implementation_status === 'awaiting_github_pr_preparation' ? <div className="mt-3 rounded-md border border-cyan-400/35 bg-cyan-400/10 p-3 text-sm text-cyan-100">{copy.fixApproved}</div> : null}</div>{!dependency && (needsHumanApproval(r) || (reviewOnly && r.status === 'in_progress')) ? <div className="flex flex-wrap gap-2">{reviewOnly ? <><button onClick={() => onDisposition('completed', 'expected')} disabled={loading} className="rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-100">{copy.expectedChange}</button><button onClick={() => onDisposition('in_progress', 'investigate')} disabled={loading} className="rounded-md border border-yellow-400/40 px-3 py-1.5 text-xs text-yellow-100">{copy.investigateChange}</button><button onClick={() => onDisposition('rejected', 'escalate')} disabled={loading} className="rounded-md border border-red-400/40 px-3 py-1.5 text-xs text-red-100">{copy.escalateChange}</button></> : hasPlan ? <button onClick={onApprove} disabled={loading} className="rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-60">{loading ? copy.approving : copy.approvePlan}</button> : <button onClick={onPreparePlan} disabled={loading} className="rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:brightness-110 disabled:opacity-60">{loading ? copy.preparing : copy.preparePlan}</button>}{reviewOnly ? null : <button onClick={onReject} disabled={loading} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text disabled:opacity-60">{copy.reject}</button>}</div> : null}{!dependency && r.status === 'approved' && !reviewOnly && !hasPlan ? <button onClick={onPreparePlan} disabled={loading} className="rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:brightness-110 disabled:opacity-60">{loading ? copy.preparing : copy.prepareMissingPlan}</button> : null}{dependency && !terminal ? <button onClick={onReassess} disabled={loading || !dependencyRescanUrl(r)} className="rounded-md border border-accent px-3 py-1.5 text-xs text-accent disabled:opacity-60">{loading ? copy.scanning : copy.reassess}</button> : null}</div></div>
}

function FixPlanView({ plan, status, approved, approvalRequired, historical = false, copy }: { plan: FixPlan; status: string; approved: boolean; approvalRequired: boolean; historical?: boolean; copy: CyberCopy }) {
  return <div className="mt-3 rounded-md border border-accent/30 bg-surface p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-accent/35 bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">{copy.fixPlan} {status.replaceAll('_', ' ')}</span><span className="text-xs text-text-muted">{historical ? `${copy.recordedApproval}: ${approved ? copy.yes : copy.no}` : approved ? `${copy.approvedLabel}: ${copy.yes}` : approvalRequired ? `${copy.approvedLabel}: ${copy.no}` : copy.approvalNotRequired}</span></div><p className="mt-2 text-sm text-text-muted">{cyberProductText(plan.summary || copy.prepareDescription)}</p>{Array.isArray(plan.proposedChanges) && plan.proposedChanges.length ? <div className="mt-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.proposedChanges}</div><ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-text-muted">{plan.proposedChanges.map((c, i) => <li key={i}><span className="font-semibold text-text">{c.packageName}@{c.currentVersion}</span>{c.targetVersion ? <span> → <span className="font-semibold text-text">{c.targetVersion}</span></span> : <span> — {copy.noTargetVersion}</span>} — {cyberProductText(c.proposedAction)}</li>)}</ul></div> : null}{Array.isArray(plan.validationSteps) && plan.validationSteps.length ? <div className="mt-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.validationSteps}</div><ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-text-muted">{plan.validationSteps.map((s, i) => <li key={i}>{cyberProductText(s)}</li>)}</ul></div> : null}{Array.isArray(plan.safetyControls) && plan.safetyControls.length ? <div className="mt-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.safetyControls}</div><ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-text-muted">{plan.safetyControls.map((s, i) => <li key={i}>{cyberProductText(s)}</li>)}</ul></div> : null}</div>
}

function IssueReviewReport({ report, onDownloadPdf, onPrint, pdfLoading, copy }: { report: Report; onDownloadPdf: () => void; onPrint: () => void; pdfLoading: boolean; copy: CyberCopy }) {
  const unknown = unclassifiedAdvisoryCount(report.advisories)
  return <section className="mt-5 rounded-md border border-border bg-surface p-4"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 inline-flex rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">{copy.issueReviewReport}</div><h2 className="text-base font-semibold text-text">{copy.issueReviewTitle}</h2><p className="mt-1 max-w-[820px] text-sm leading-relaxed text-text-muted">{copy.issueReviewSubtitle}</p></div><div className="flex flex-col items-start gap-2 sm:items-end"><div className="rounded-md border border-border bg-bg px-3 py-2 text-xs text-text-muted"><div>{report.repo || report.target}</div><div>{report.branch || uiText('generatedUi.u_37a8eec1ce19687d')} · {safeDate(report.generatedAt)}</div></div><div className="flex flex-wrap gap-2"><button onClick={onDownloadPdf} disabled={pdfLoading} className="rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:brightness-110 disabled:opacity-60">{pdfLoading ? copy.preparingPdf : copy.downloadPdf}</button><button onClick={onPrint} className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text">{copy.printSavePdf}</button></div></div></div><div className="grid gap-3 md:grid-cols-4"><ReviewMetric label={copy.unknownSeverity} value={unknown} /><ReviewMetric label={copy.issuesFound} value={report.advisories.length} /><ReviewMetric label={copy.affectedPackages} value={new Set(report.advisories.map(a => a.packageName)).size} /><ReviewMetric label={copy.filesReferenced} value={new Set(report.advisories.map(a => a.sourceFile)).size} /></div>{unknown > 0 ? <p role="status" className="mt-3 rounded-md border border-yellow-400/40 bg-yellow-400/10 p-3 text-sm text-yellow-100">{copy.severityWarning}</p> : null}<div className="mt-4 flex flex-col gap-3">{report.advisories.map((a, index) => <div key={`${a.id}:${a.packageName}:${a.version}:${index}`} className="rounded-md border border-border bg-bg p-4"><div className="mb-3 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{copy.statuses[a.severity] || a.severity}</span><span className="text-sm font-semibold text-text">{copy.advisory} {index + 1}: {a.packageName}@{a.version}</span></div><div className="grid gap-3 md:grid-cols-2"><ReviewItem label={copy.whatWasFound} value={`${a.packageName}@${a.version} → ${a.id}`} /><ReviewItem label={copy.whereFound} value={a.sourceFile || copy.source} /><ReviewItem label={copy.whyMatters} value={issueExplanation(a, copy)} /><ReviewItem label={copy.recommendedNextStep} value={recommendedAction(a, copy)} /></div><div className="mt-3 rounded-md border border-border/70 bg-surface p-3 text-sm text-text-muted"><span className="font-semibold text-text">{copy.advisorySummary} </span>{a.summary || copy.noAdvisory}{a.detailsUrl ? <a className="ms-2 text-accent" href={a.detailsUrl} target="_blank" rel="noreferrer">{copy.openAdvisory} →</a> : null}</div></div>)}</div></section>
}

function issueExplanation(a: Advisory, copy: CyberCopy) { if (a.severity === 'critical') return `${copy.critical}: ${a.summary}`; if (a.severity === 'high') return `${copy.high}: ${a.summary}`; if (a.severity === 'medium') return `${copy.medium}: ${a.summary}`; if (a.severity === 'low') return `${copy.low}: ${a.summary}`; return a.summary || copy.noAdvisory }
function recommendedAction(a: Advisory, copy: CyberCopy) { const fixed = Array.isArray(a.fixedVersions) ? a.fixedVersions.find(v => eligibleDependencyTarget(a.version, v)) || '' : ''; return fixed ? `${copy.prepareFixPlan}: ${a.packageName} ${a.version} → ${fixed}` : copy.prepareDescription }
function ReviewMetric({ label, value }: { label: string; value: number }) { return <div className="rounded-md border border-border bg-bg p-3"><div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div><div className="mt-1 text-xl font-semibold text-text">{value}</div></div> }
function ReviewItem({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div><p className="mt-1 text-sm leading-relaxed text-text-muted">{value}</p></div> }
function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) { const toneCls = tone ? sevClass[tone] : 'border-border bg-surface text-text'; return <div className={`rounded-md border p-4 ${toneCls}`}><div className="text-xs uppercase tracking-wider opacity-70">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div> }