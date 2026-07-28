'use client'

// saas/app/dashboard/cybersecurity/page.tsx
// Cybersecurity Center MVP. Audit = readiness/reports. Cybersecurity = technical
// monitoring checks, alert inbox, scheduled scans, plan-first remediation,
// and human approval before any PR/code change.

import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import CyberActivityPanel, { type CyberActivityState } from '@/components/cybersecurity/CyberActivityPanel'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
  findings?: unknown[]
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

type CyberCopy = {
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
  filters: Record<Filter, string>
  statuses: Record<string, string>
}

const COPY: Record<string, CyberCopy> = {
  en: {
    eyebrow: uiCopy('u_92812a181917c056'), title: uiCopy('u_52d987d01e3a0360'), subtitle: uiCopy('u_2b7080edfd0192b5'), auditCenter: uiCopy('u_a6b82b72825b6b1e'),
    repositoryUrl: uiCopy('u_b1070fe77cdd1033'), repositoryPlaceholder: uiCopy('u_4999eefde8ffb6a3'), repositoryHint: uiCopy('u_0d8249f83e4b8293'), monitorLabel: uiCopy('u_69bba5dd2069cc52'), monitorPlaceholder: uiCopy('u_31a2103df874b442'), frequency: uiCopy('u_ed7f2a08ae0e463f'), daily: uiCopy('u_cb6ba54ab6da714e'), weekly: uiCopy('u_559d5807be70d1ca'), maxPackages: uiCopy('u_c9be896bbb568595'), runScan: uiCopy('u_5ff9d81fde72aa0f'), scanning: uiCopy('u_01407b5a0c07e433'), addMonitor: uiCopy('u_261f77992cd64a6a'), adding: uiCopy('u_a5485442e276dfb6'),
    openAlerts: uiCopy('u_f8be06533d7f455d'), monitors: uiCopy('u_861ccf9d6032ca36'), enabled: uiCopy('u_955d42ba50410f9b'), recentScans: uiCopy('u_2b9fc7487a787dea'), awaitingApproval: uiCopy('u_16bc0ea8e177ee8d'), packages: uiCopy('u_c132383fb061d2de'), advisories: uiCopy('u_38668d01038ff31d'), critical: uiCopy('u_bd3cb67cfde4910d'), high: uiCopy('u_5e3190e29fc670ab'), medium: uiCopy('u_147bbc999a59cec5'), low: uiCopy('u_51e6728a761b39a2'),
    prepareTitle: uiCopy('u_a5ab731907d04722'), prepareDescription: uiCopy('u_211087390905185f'), prepareFixPlan: uiCopy('u_42ae5eb98a0c65c3'), preparingPlan: uiCopy('u_4b14d76d853fdc6d'),
    humanQueue: uiCopy('u_320f7b1c6b6aea64'), humanEmpty: uiCopy('u_6416cc5cbc0ea3b2'), alertInbox: uiCopy('u_f5e28e02cf66874e'), noAlerts: uiCopy('u_37af352dbbdff41d'), monitoredRepositories: uiCopy('u_3704734487dee0d3'), noMonitors: uiCopy('u_c5ba8ee4a50954fd'), technicalTable: uiCopy('u_8f872049d1d2da03'), noAdvisories: uiCopy('u_747b940d21ebda24'), recentDependencyScans: uiCopy('u_64f2d71b6894e11d'), noStoredScans: uiCopy('u_6d569181c7dae7fa'),
    repository: uiCopy('u_55e69e338bf423c4'), lastScan: uiCopy('u_55328431a2e30365'), findings: uiCopy('u_43fa8cc1c52f6926'), status: uiCopy('u_ce95f0a487bc2095'), action: uiCopy('u_d027dc9d8e930e5d'), notScannedYet: uiCopy('u_c1f3af2c67678d6a'), disable: uiCopy('u_07b45f795ac79551'), enable: uiCopy('u_74bfade9372cbc69'), severity: uiCopy('u_8ddc3dc290c36f37'), package: uiCopy('u_b0957b9842ae9791'), advisory: uiCopy('u_ca088a58084b116b'), source: uiCopy('u_00d2190d7cd3e718'), date: uiCopy('u_54979e427813a9e0'), criticalHigh: uiCopy('u_0b4125d1b43fb83b'), details: uiCopy('u_71f0c06f070a8905'),
    issueReviewReport: uiCopy('u_5849caf3327167c2'), issueReviewTitle: uiCopy('u_e8eacc2bbeed3e95'), issueReviewSubtitle: uiCopy('u_5ba40e5a4ccdd691'), issuesFound: uiCopy('u_8516dfef5dd4f5e5'), affectedPackages: uiCopy('u_709ac85793e54a8e'), filesReferenced: uiCopy('u_743a25823e26a685'), whatWasFound: uiCopy('u_665b4a1eb8c251a3'), whereFound: uiCopy('u_7586208aecb3a276'), whyMatters: uiCopy('u_da5fe0cfc181f905'), recommendedNextStep: uiCopy('u_df93dcaa03040cee'), advisorySummary: uiCopy('u_02bd362fe0c39641'), openAdvisory: uiCopy('u_17fd4739daf24899'), downloadPdf: uiCopy('u_f0307c25e9d50575'), preparingPdf: uiCopy('u_09110c003910601b'), printSavePdf: uiCopy('u_991a4006c76762dc'),
    planFirst: uiCopy('u_dadf9cf3bcdf0ddb'), yes: uiCopy('u_30616ae34270047e'), no: uiCopy('u_ff2a83108fe7fbc5'), humanApproved: uiCopy('u_0fa1a62467d6122c'), fixPlan: uiCopy('u_556faab9bd4774e2'), notStarted: uiCopy('u_639c17b00adc7edb'), fixApproved: uiCopy('u_da135c4c77b2a319'), prPrepared: uiCopy('u_423f0cbb82fc46dd'), viewPr: uiCopy('u_926043884089c9f8'), approved: uiCopy('u_46349c14170c8f37'), rejected: uiCopy('u_7685c8f4509e2944'), approvePlan: uiCopy('u_cdc2471935648b67'), approving: uiCopy('u_aabda71b9af39106'), preparePlan: uiCopy('u_d82b8f8835ae78c6'), preparing: uiCopy('u_225c30e54fb88acc'), reject: uiCopy('u_0d0c505a1585c2ab'), prepareMissingPlan: uiCopy('u_3a9c35e592a31724'), proposedChanges: uiCopy('u_fe27c613150a2dc9'), validationSteps: uiCopy('u_cd23b5a495403853'), safetyControls: uiCopy('u_70263b6ba36bc44c'), approvedLabel: uiCopy('u_a99f10d7c6546380'), currentVersion: uiCopy('u_9c8c54e338d0a455'), targetVersion: uiCopy('u_ca4d924f786bbbb5'), noTargetVersion: uiCopy('u_5a412d599b802a50'), resolve: uiCopy('u_9ff8a197017b226f'), ignore: uiCopy('u_35b4855205cb18b6'), noRepo: uiCopy('u_2ce1c17565df4028'), noAdvisory: uiCopy('u_6c2944e0300467d4'), scanFailed: uiCopy('u_235a163c3a814010'), monitorRequired: uiCopy('u_2d81af5d2dcea335'), monitorCreateFailed: uiCopy('u_08d472a1bf81a9cc'), fixPlanFailed: uiCopy('u_663536d5a6073f8c'), approveFailed: uiCopy('u_0a877da8e455f849'), pdfFailed: uiCopy('u_c5c876b9151fd67e'), remediationPrepared: uiCopy('u_bfaca4fe859b3de6'), remediationApproved: uiCopy('u_c74974e718e9504c'),
    filters: { all: uiCopy('u_e91c892912100cda'), open: uiCopy('u_89fbbf1b533857ae'), resolved: uiCopy('u_e4f698ee17ee1c54'), ignored: uiCopy('u_0d182be7f7fc6cf5') }, statuses: { awaiting_human_review: uiCopy('u_6316b27889777845'), approved: uiCopy('u_ae580116484bc9f2'), rejected: uiCopy('u_81b6fb0b675d0110'), in_progress: uiCopy('u_1ac7e15cb496fcde'), completed: uiCopy('u_eda968518b9a97bf'), cancelled: uiCopy('u_bc776cbf6b3e664c'), open: uiCopy('u_c559ce72c6713d2c'), resolved: uiCopy('u_b21122681af54d9b'), ignored: uiCopy('u_07e87e2a76427964') },
  },
  es: {
    eyebrow: 'Centro de Ciberseguridad', title: 'Monitoreo de avisos de dependencias', subtitle: 'Ejecuta análisis, monitorea repositorios, revisa problemas detectados, revisa el plan de corrección y luego aprueba o rechaza.', auditCenter: 'Centro de Auditoría', repositoryUrl: 'URL del repositorio', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: 'Repos públicos de GitHub por ahora. Los repos privados requieren OAuth de GitHub conectado.', monitorLabel: 'Etiqueta del monitor', monitorPlaceholder: 'Aplicación de producción', frequency: 'Frecuencia', daily: 'Diaria', weekly: 'Semanal', maxPackages: 'Máx. paquetes', runScan: 'Ejecutar análisis', scanning: 'Analizando…', addMonitor: 'Agregar monitor', adding: 'Agregando…', openAlerts: 'Alertas abiertas', monitors: 'Monitores', enabled: 'Activos', recentScans: 'Análisis recientes', awaitingApproval: 'Pendiente de aprobación', packages: 'Paquetes', advisories: 'Avisos', critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', prepareTitle: '¿Preparar un plan de corrección?', prepareDescription: 'Esto viene después del informe de revisión. SignalBoost preparará primero un plan propuesto. Nada cambia automáticamente. Un humano/admin debe revisar y aprobar el plan antes de preparar PR o cambiar código.', prepareFixPlan: 'Preparar plan', preparingPlan: 'Preparando plan…', humanQueue: 'Cola de aprobación humana', humanEmpty: 'Aún no hay planes de remediación. Después de que un informe encuentre problemas, los usuarios pueden pedir a SignalBoost que prepare un plan aquí.', alertInbox: 'Bandeja de alertas', noAlerts: 'Aún no hay alertas de ciberseguridad.', monitoredRepositories: 'Repositorios monitoreados', noMonitors: 'Aún no hay monitores. Agrega uno arriba para incluirlo en los análisis programados.', technicalTable: 'Tabla técnica de avisos', noAdvisories: 'No se encontraron avisos para las versiones exactas recopiladas.', recentDependencyScans: 'Análisis recientes de dependencias', noStoredScans: 'Aún no hay análisis guardados.', repository: 'Repositorio', lastScan: 'Último análisis', findings: 'Hallazgos', status: 'Estado', action: 'Acción', notScannedYet: 'Aún no analizado', disable: 'Desactivar', enable: 'Activar', severity: 'Severidad', package: 'Paquete', advisory: 'Aviso', source: 'Fuente', date: 'Fecha', criticalHigh: 'Crítico/Alto', details: 'Detalles', issueReviewReport: 'Informe de revisión', issueReviewTitle: 'Revisión de problemas de dependencias detectados', issueReviewSubtitle: 'SignalBoost revisó el resultado antes de ofrecer ayuda. Este informe explica qué se detectó, dónde, por qué importa y el siguiente paso recomendado. Aún no se ha solicitado ni aprobado ninguna corrección.', issuesFound: 'Problemas encontrados', affectedPackages: 'Paquetes afectados', filesReferenced: 'Archivos referenciados', whatWasFound: 'Qué se encontró', whereFound: 'Dónde se encontró', whyMatters: 'Por qué importa', recommendedNextStep: 'Siguiente paso recomendado', advisorySummary: 'Resumen del aviso:', openAdvisory: 'Abrir aviso', downloadPdf: 'Descargar PDF', preparingPdf: 'Preparando PDF…', printSavePdf: 'Imprimir / Guardar PDF', planFirst: 'Plan primero', yes: 'sí', no: 'no', humanApproved: 'Aprobado por humano', fixPlan: 'Plan de corrección', notStarted: 'no iniciado', fixApproved: 'Plan aprobado. La preparación del PR se ejecutará automáticamente cuando haya una actualización directa segura.', prPrepared: 'PR de GitHub preparado para revisión humana.', viewPr: 'Ver PR', approved: 'Aprobado', rejected: 'Rechazado', approvePlan: 'Aprobar plan', approving: 'Aprobando…', preparePlan: 'Preparar plan', preparing: 'Preparando…', reject: 'Rechazar', prepareMissingPlan: 'Preparar plan faltante', proposedChanges: 'Cambios propuestos', validationSteps: 'Pasos de validación', safetyControls: 'Controles de seguridad', approvedLabel: 'Aprobado', currentVersion: 'actual', targetVersion: 'objetivo', noTargetVersion: 'versión objetivo pendiente de confirmar', resolve: 'Resolver', ignore: 'Ignorar', noRepo: 'repo desconocido', noAdvisory: 'aviso', scanFailed: 'El análisis de ciberseguridad falló.', monitorRequired: 'Se requiere la URL del repositorio para agregar un monitor.', monitorCreateFailed: 'No se pudo agregar el monitor.', fixPlanFailed: 'No se pudo preparar el plan.', approveFailed: 'No se pudo aprobar el plan.', pdfFailed: 'No se pudo generar el PDF.', remediationPrepared: 'Plan preparado para revisión humana. Revisa el plan en la cola antes de aprobar.', remediationApproved: 'Plan aprobado. SignalBoost preparará un PR de GitHub automáticamente cuando sea seguro.', filters: { all: 'Todos', open: 'Abiertas', resolved: 'Resueltas', ignored: 'Ignoradas' }, statuses: { awaiting_human_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', in_progress: 'En progreso', completed: 'Completado', cancelled: 'Cancelado', open: 'Abierta', resolved: 'Resuelta', ignored: 'Ignorada' },
  },
  pt: {
    eyebrow: 'Centro de Cibersegurança', title: 'Monitoramento de Avisos de Dependências', subtitle: 'Execute análises, monitore repositórios, revise problemas detectados, revise o plano de correção e então aprove ou rejeite.', auditCenter: 'Centro de Auditoria', repositoryUrl: 'URL do repositório', repositoryPlaceholder: 'https://github.com/owner/repo', repositoryHint: 'Repos públicos do GitHub por enquanto. Repos privados exigem OAuth do GitHub conectado.', monitorLabel: 'Rótulo do monitor', monitorPlaceholder: 'Aplicativo de produção', frequency: 'Frequência', daily: 'Diária', weekly: 'Semanal', maxPackages: 'Máx. pacotes', runScan: 'Executar análise', scanning: 'Analisando…', addMonitor: 'Adicionar monitor', adding: 'Adicionando…', openAlerts: 'Alertas abertos', monitors: 'Monitores', enabled: 'Ativos', recentScans: 'Análises recentes', awaitingApproval: 'Aguardando aprovação', packages: 'Pacotes', advisories: 'Avisos', critical: 'Crítico', high: 'Alto', medium: 'Médio', low: 'Baixo', prepareTitle: 'Preparar um plano de correção?', prepareDescription: 'Isso vem após a revisão do problema acima. O SignalBoost preparará primeiro um plano proposto. Nada será alterado automaticamente. Um humano/admin deve revisar e aprovar o plano antes da preparação de PR ou alteração de código.', prepareFixPlan: 'Preparar plano', preparingPlan: 'Preparando plano…', humanQueue: 'Fila de aprovação humana', humanEmpty: 'Ainda não há planos de remediação. Após um relatório encontrar problemas, usuários podem pedir ao SignalBoost para preparar um plano aqui.', alertInbox: 'Caixa de alertas', noAlerts: 'Ainda não há alertas de cibersegurança.', monitoredRepositories: 'Repositórios monitorados', noMonitors: 'Ainda não há monitores. Adicione um acima para incluí-lo nas verificações programadas.', technicalTable: 'Tabela técnica de avisos', noAdvisories: 'Nenhum aviso de dependência encontrado para as versões exatas coletadas.', recentDependencyScans: 'Análises recentes de dependências', noStoredScans: 'Ainda não há análises de cibersegurança salvas.', repository: 'Repositório', lastScan: 'Última análise', findings: 'Achados', status: 'Status', action: 'Ação', notScannedYet: 'Ainda não analisado', disable: 'Desativar', enable: 'Ativar', severity: 'Severidade', package: 'Pacote', advisory: 'Aviso', source: 'Fonte', date: 'Data', criticalHigh: 'Crítico/Alto', details: 'Detalhes', issueReviewReport: 'Relatório de revisão', issueReviewTitle: 'Revisão dos problemas de dependência detectados', issueReviewSubtitle: 'O SignalBoost revisou o resultado antes de oferecer ajuda. Este relatório explica o que foi detectado, onde foi encontrado, por que importa e o próximo passo recomendado. Nenhuma correção foi solicitada ou aprovada ainda.', issuesFound: 'Problemas encontrados', affectedPackages: 'Pacotes afetados', filesReferenced: 'Arquivos referenciados', whatWasFound: 'O que foi encontrado', whereFound: 'Onde foi encontrado', whyMatters: 'Por que importa', recommendedNextStep: 'Próximo passo recomendado', advisorySummary: 'Resumo do aviso:', openAdvisory: 'Abrir aviso', downloadPdf: 'Baixar PDF', preparingPdf: 'Preparando PDF…', printSavePdf: 'Imprimir / Salvar PDF', planFirst: 'Plano primeiro', yes: 'sim', no: 'não', humanApproved: 'Aprovado por humano', fixPlan: 'Plano de correção', notStarted: 'não iniciado', fixApproved: 'Plano aprovado. A preparação de PR será executada automaticamente quando houver uma atualização direta segura.', prPrepared: 'PR do GitHub preparado para revisão humana.', viewPr: 'Ver PR', approved: 'Aprovado', rejected: 'Rejeitado', approvePlan: 'Aprovar plano', approving: 'Aprovando…', preparePlan: 'Preparar plano', preparing: 'Preparando…', reject: 'Rejeitar', prepareMissingPlan: 'Preparar plano ausente', proposedChanges: 'Mudanças propostas', validationSteps: 'Etapas de validação', safetyControls: 'Controles de segurança', approvedLabel: 'Aprovado', currentVersion: 'atual', targetVersion: 'alvo', noTargetVersion: 'versão alvo pendente de confirmação', resolve: 'Resolver', ignore: 'Ignorar', noRepo: 'repo desconhecido', noAdvisory: 'aviso', scanFailed: 'A análise de cibersegurança falhou.', monitorRequired: 'A URL do repositório é obrigatória para adicionar um monitor.', monitorCreateFailed: 'Não foi possível adicionar o monitor.', fixPlanFailed: 'Não foi possível preparar o plano.', approveFailed: 'Não foi possível aprovar o plano.', pdfFailed: 'Não foi possível gerar o PDF.', remediationPrepared: 'Plano preparado para revisão humana. Revise o plano na fila antes de aprovar.', remediationApproved: 'Plano aprovado. O SignalBoost preparará um PR do GitHub automaticamente quando for seguro.', filters: { all: 'Todos', open: 'Abertos', resolved: 'Resolvidos', ignored: 'Ignorados' }, statuses: { awaiting_human_review: 'Em revisão', approved: 'Aprovado', rejected: 'Rejeitado', in_progress: 'Em andamento', completed: 'Concluído', cancelled: 'Cancelado', open: 'Aberto', resolved: 'Resolvido', ignored: 'Ignorado' },
  },
  pl: null as any,
  ru: null as any,
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

function copyFor(lang: string): CyberCopy { return COPY[lang] || COPY.en }
function safeDate(value?: string | null) { return value ? new Date(value).toLocaleString() : '' }

export default function CybersecurityCenterPage() {
  const { t, lang } = useTranslation()
  const baseCopy = copyFor(lang)
  const tr = (key: keyof CyberCopy, fallback: string) => t(`cybersecurity.${String(key)}`, fallback)
  const copy: CyberCopy = { ...baseCopy, eyebrow: tr(uiCopy('u_44140162f13372af'), baseCopy.eyebrow), title: tr(uiCopy('u_f7c3144622afc63d'), baseCopy.title), subtitle: tr(uiCopy('u_ce36ff6f5473f527'), baseCopy.subtitle) }

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

  async function runScan() {
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
        body: JSON.stringify({ url: url.trim(), maxPackages, stream: true }),
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
      const res = await fetch('/api/hub/cyber/dependencies', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request_remediation', scanId, report }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) { setError(json?.error || copy.fixPlanFailed); return }
      setRemediationMessage(copy.remediationPrepared)
      await loadDashboard()
    } catch (err) { setError(err instanceof Error ? err.message : copy.fixPlanFailed) }
    finally { setRemediationLoading(false) }
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

  async function updateRemediation(id: string, status: RemediationRequest['status']) {
    setPlanLoadingId(id)
    try {
      await fetch('/api/hub/cyber/dependencies', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remediationId: id, status }) })
      await loadDashboard()
    } catch { /* non-critical */ }
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
  const openAlerts = alerts.filter(a => a.status === 'open')
  const pendingRemediation = remediationRequests.filter(r => r.status === 'awaiting_human_review')

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
            <div className="flex flex-wrap gap-2"><button onClick={runScan} disabled={loading} className="rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-60">{loading ? copy.scanning : copy.runScan}</button><button onClick={addMonitor} disabled={monitoring} className="rounded-md border border-border bg-bg px-4 py-2 text-sm font-semibold text-text hover:bg-surface disabled:opacity-60">{monitoring ? copy.adding : copy.addMonitor}</button></div>
          </div>
        </section>

        <CyberActivityPanel activity={activity} lang={lang} />

        {error ? <div className="mt-4 rounded-md border border-danger bg-surface p-4 text-sm text-danger">{error}</div> : null}
        {remediationMessage ? <div className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">{remediationMessage}</div> : null}

        <section className="mt-5 grid gap-3 md:grid-cols-5"><Metric label={copy.openAlerts} value={openAlerts.length} tone={openAlerts.some(a => a.severity === 'critical') ? 'critical' : openAlerts.length ? 'high' : undefined} /><Metric label={copy.monitors} value={monitors.length} /><Metric label={copy.enabled} value={monitors.filter(m => m.is_enabled).length} /><Metric label={copy.recentScans} value={history.length} /><Metric label={copy.awaitingApproval} value={pendingRemediation.length} tone={pendingRemediation.length ? 'medium' : undefined} /></section>
        {summary ? <section className="mt-5 grid gap-3 md:grid-cols-6"><Metric label={copy.packages} value={summary.packagesScanned} /><Metric label={copy.advisories} value={summary.advisories} /><Metric label={copy.critical} value={summary.critical} tone="critical" /><Metric label={copy.high} value={summary.high} tone="high" /><Metric label={copy.medium} value={summary.medium} tone="medium" /><Metric label={copy.low} value={summary.low} tone="low" /></section> : null}

        {report && report.advisories.length > 0 ? <IssueReviewReport report={report} onDownloadPdf={downloadIssuePdf} onPrint={printIssueReview} pdfLoading={pdfLoading} copy={copy} /> : null}
        {report && report.advisories.length > 0 ? <section className="mt-5 rounded-md border border-accent/40 bg-accent/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-text">{copy.prepareTitle}</h2><p className="mt-1 max-w-[760px] text-sm leading-relaxed text-text-muted">{copy.prepareDescription}</p></div><button onClick={requestRemediation} disabled={remediationLoading} className="rounded-md border border-accent bg-accent px-4 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-60">{remediationLoading ? copy.preparingPlan : copy.prepareFixPlan}</button></div></section> : null}

        <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.humanQueue}</h2>{remediationRequests.length === 0 ? <p className="text-sm text-text-muted">{copy.humanEmpty}</p> : <div className="flex flex-col gap-3">{remediationRequests.slice(0, 20).map(r => <RemediationCard key={r.id} r={r} loading={planLoadingId === r.id} onApprove={() => approveFixPlan(r.id)} onReject={() => updateRemediation(r.id, 'rejected')} onPreparePlan={() => prepareFixPlan(r.id)} onApprovePlan={() => approveFixPlan(r.id)} copy={copy} />)}</div>}</section>
        <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.alertInbox}</h2>{alerts.length === 0 ? <p className="text-sm text-text-muted">{copy.noAlerts}</p> : <div className="flex flex-col gap-3">{alerts.slice(0, 20).map(a => <div key={a.id} className="rounded-md border border-border bg-bg p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{copy.statuses[a.severity] || a.severity}</span><span className="text-sm font-semibold text-text">{a.title}</span><span className="rounded-full border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-text-muted">{copy.statuses[a.status] || a.status}</span></div><p className="mt-2 text-sm text-text-muted">{a.message}</p><p className="mt-1 text-xs text-text-muted/80">{a.repo || copy.noRepo} · {a.advisory_id || copy.noAdvisory} · {safeDate(a.created_at)}</p>{a.details_url ? <a className="mt-1 inline-block text-xs font-semibold text-accent" href={a.details_url} target="_blank" rel="noreferrer">{copy.details} →</a> : null}</div>{a.status === 'open' ? <div className="flex gap-2"><button onClick={() => resolveAlert(a.id, 'resolved')} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">{copy.resolve}</button><button onClick={() => resolveAlert(a.id, 'ignored')} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">{copy.ignore}</button></div> : null}</div></div>)}</div>}</section>
        <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.monitoredRepositories}</h2>{monitors.length === 0 ? <p className="text-sm text-text-muted">{copy.noMonitors}</p> : <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">{copy.repository}</th><th className="border-b border-border p-3">{copy.frequency}</th><th className="border-b border-border p-3">{copy.lastScan}</th><th className="border-b border-border p-3">{copy.findings}</th><th className="border-b border-border p-3">{copy.status}</th><th className="border-b border-border p-3">{copy.action}</th></tr></thead><tbody>{monitors.map(m => <tr key={m.id} className="border-b border-border/70"><td className="p-3 text-text"><div className="font-semibold">{m.label || m.repo || m.repo_url}</div><div className="text-xs text-text-muted">{m.repo_url}</div></td><td className="p-3 text-text-muted">{m.frequency}</td><td className="p-3 text-text-muted">{m.last_scan_at ? safeDate(m.last_scan_at) : copy.notScannedYet}</td><td className="p-3 text-text-muted">{m.last_advisories} · {m.last_critical}/{m.last_high}</td><td className="p-3 text-text-muted">{m.is_enabled ? copy.enabled : copy.disable}{m.last_error ? ` · ${m.last_error}` : ''}</td><td className="p-3"><button onClick={() => toggleMonitor(m.id, !m.is_enabled)} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">{m.is_enabled ? copy.disable : copy.enable}</button></td></tr>)}</tbody></table></div>}</section>
        {report ? <section className="mt-5 rounded-md border border-border bg-surface p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-text">{copy.technicalTable}</h2><p className="text-xs text-text-muted">{report.repo || report.target} · {report.branch || uiCopy('u_c82e4f9aa2d0ddc2')} · {safeDate(report.generatedAt)}</p></div></div>{report.advisories.length === 0 ? <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">{copy.noAdvisories}</div> : <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">{copy.severity}</th><th className="border-b border-border p-3">{copy.package}</th><th className="border-b border-border p-3">{copy.advisory}</th><th className="border-b border-border p-3">{copy.source}</th></tr></thead><tbody>{report.advisories.map(a => <tr key={`${a.id}:${a.packageName}:${a.version}`} className="border-b border-border/70"><td className="p-3"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{copy.statuses[a.severity] || a.severity}</span></td><td className="p-3 text-text"><div className="font-semibold">{a.packageName}</div><div className="text-xs text-text-muted">{a.version}</div></td><td className="p-3 text-text-muted"><div className="font-semibold text-text">{a.id}</div><div>{a.summary}</div>{a.detailsUrl ? <a className="mt-1 inline-block text-accent" href={a.detailsUrl} target="_blank" rel="noreferrer">{copy.details} →</a> : null}</td><td className="p-3 text-xs text-text-muted">{a.sourceFile}</td></tr>)}</tbody></table></div>}</section> : null}
        <section className="mt-5 rounded-md border border-border bg-surface p-4"><h2 className="mb-3 text-sm font-semibold text-text">{copy.recentDependencyScans}</h2>{history.length === 0 ? <p className="text-sm text-text-muted">{copy.noStoredScans}</p> : <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="border-b border-border p-3">{copy.date}</th><th className="border-b border-border p-3">{copy.repository}</th><th className="border-b border-border p-3">{copy.packages}</th><th className="border-b border-border p-3">{copy.advisories}</th><th className="border-b border-border p-3">{copy.criticalHigh}</th></tr></thead><tbody>{history.map(h => <tr key={h.id} className="border-b border-border/70"><td className="p-3 text-text-muted">{safeDate(h.created_at)}</td><td className="p-3 text-text">{h.repo || h.target}</td><td className="p-3 text-text-muted">{h.packages_scanned}</td><td className="p-3 text-text-muted">{h.advisories_count}</td><td className="p-3 text-text-muted">{h.critical}/{h.high}</td></tr>)}</tbody></table></div>}</section>
      </div>
    </main>
  )
}

function RemediationCard({ r, loading, onApprove, onReject, onPreparePlan, onApprovePlan, copy }: { r: RemediationRequest; loading: boolean; onApprove: () => void; onReject: () => void; onPreparePlan: () => void; onApprovePlan: () => void; copy: CyberCopy }) {
  const plan = r.fix_plan || null
  const hasPlan = !!(plan && Object.keys(plan).length > 0 && r.fix_plan_status && r.fix_plan_status !== 'not_started')
  return <div className="rounded-md border border-border bg-bg p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass[r.status] || statusClass.cancelled}`}>{copy.statuses[r.status] || r.status.replaceAll('_', ' ')}</span><span className="text-sm font-semibold text-text">{r.title}</span></div><p className="mt-2 text-sm text-text-muted">{r.summary}</p><p className="mt-1 text-xs text-text-muted/80">{r.repo || r.target || copy.noRepo} · {safeDate(r.created_at)}</p><p className="mt-1 text-xs text-text-muted/80">{copy.planFirst}: {hasPlan ? copy.yes : copy.no} · {copy.humanApproved}: {r.human_approved ? copy.yes : copy.no} · {copy.fixPlan}: {r.fix_plan_status || copy.notStarted}</p>{hasPlan ? <FixPlanView plan={plan as FixPlan} status={r.fix_plan_status || 'ready_for_review'} approved={!!r.fix_plan_approved} copy={copy} /> : null}{r.pull_request_url ? <div className="mt-3 rounded-md border border-emerald-400/35 bg-emerald-400/10 p-3 text-sm text-emerald-100">{copy.prPrepared} <a className="font-semibold underline" href={r.pull_request_url} target="_blank" rel="noreferrer">{copy.viewPr} →</a></div> : r.fix_plan_status === 'approved_for_pr' ? <div className="mt-3 rounded-md border border-cyan-400/35 bg-cyan-400/10 p-3 text-sm text-cyan-100">{copy.fixApproved}</div> : null}</div>{r.status === 'awaiting_human_review' ? <div className="flex gap-2">{hasPlan ? <button onClick={onApprove} disabled={loading} className="rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-60">{loading ? copy.approving : copy.approvePlan}</button> : <button onClick={onPreparePlan} disabled={loading} className="rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:brightness-110 disabled:opacity-60">{loading ? copy.preparing : copy.preparePlan}</button>}<button onClick={onReject} disabled={loading} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text disabled:opacity-60">{copy.reject}</button></div> : null}{r.status === 'approved' && !hasPlan ? <button onClick={onPreparePlan} disabled={loading} className="rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:brightness-110 disabled:opacity-60">{loading ? copy.preparing : copy.prepareMissingPlan}</button> : null}{r.status === 'approved' && hasPlan && !r.fix_plan_approved ? <button onClick={onApprovePlan} disabled={loading} className="rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-400/10 disabled:opacity-60">{loading ? copy.approving : copy.approvePlan}</button> : null}</div></div>
}

function FixPlanView({ plan, status, approved, copy }: { plan: FixPlan; status: string; approved: boolean; copy: CyberCopy }) {
  return <div className="mt-3 rounded-md border border-accent/30 bg-surface p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-accent/35 bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">{copy.fixPlan} {status.replaceAll('_', ' ')}</span><span className="text-xs text-text-muted">{copy.approvedLabel}: {approved ? copy.yes : copy.no}</span></div><p className="mt-2 text-sm text-text-muted">{plan.summary || copy.prepareDescription}</p>{Array.isArray(plan.proposedChanges) && plan.proposedChanges.length ? <div className="mt-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.proposedChanges}</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text-muted">{plan.proposedChanges.map((c, i) => <li key={i}><span className="font-semibold text-text">{c.packageName}@{c.currentVersion}</span>{c.targetVersion ? <span> → <span className="font-semibold text-text">{c.targetVersion}</span></span> : <span> — {copy.noTargetVersion}</span>} — {c.proposedAction}</li>)}</ul></div> : null}{Array.isArray(plan.validationSteps) && plan.validationSteps.length ? <div className="mt-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.validationSteps}</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text-muted">{plan.validationSteps.map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null}{Array.isArray(plan.safetyControls) && plan.safetyControls.length ? <div className="mt-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{copy.safetyControls}</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-text-muted">{plan.safetyControls.map((s, i) => <li key={i}>{s}</li>)}</ul></div> : null}</div>
}

function IssueReviewReport({ report, onDownloadPdf, onPrint, pdfLoading, copy }: { report: Report; onDownloadPdf: () => void; onPrint: () => void; pdfLoading: boolean; copy: CyberCopy }) {
  return <section className="mt-5 rounded-md border border-border bg-surface p-4"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 inline-flex rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">{copy.issueReviewReport}</div><h2 className="text-base font-semibold text-text">{copy.issueReviewTitle}</h2><p className="mt-1 max-w-[820px] text-sm leading-relaxed text-text-muted">{copy.issueReviewSubtitle}</p></div><div className="flex flex-col items-start gap-2 sm:items-end"><div className="rounded-md border border-border bg-bg px-3 py-2 text-xs text-text-muted"><div>{report.repo || report.target}</div><div>{report.branch || uiCopy('u_bbf6837d5f295d13')} · {safeDate(report.generatedAt)}</div></div><div className="flex flex-wrap gap-2"><button onClick={onDownloadPdf} disabled={pdfLoading} className="rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:brightness-110 disabled:opacity-60">{pdfLoading ? copy.preparingPdf : copy.downloadPdf}</button><button onClick={onPrint} className="rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text">{copy.printSavePdf}</button></div></div></div><div className="grid gap-3 md:grid-cols-3"><ReviewMetric label={copy.issuesFound} value={report.advisories.length} /><ReviewMetric label={copy.affectedPackages} value={new Set(report.advisories.map(a => a.packageName)).size} /><ReviewMetric label={copy.filesReferenced} value={new Set(report.advisories.map(a => a.sourceFile)).size} /></div><div className="mt-4 flex flex-col gap-3">{report.advisories.map((a, index) => <div key={`${a.id}:${a.packageName}:${a.version}:${index}`} className="rounded-md border border-border bg-bg p-4"><div className="mb-3 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${sevClass[a.severity] || sevClass.unknown}`}>{copy.statuses[a.severity] || a.severity}</span><span className="text-sm font-semibold text-text">{copy.advisory} {index + 1}: {a.packageName}@{a.version}</span></div><div className="grid gap-3 md:grid-cols-2"><ReviewItem label={copy.whatWasFound} value={`${a.packageName}@${a.version} → ${a.id}`} /><ReviewItem label={copy.whereFound} value={a.sourceFile || copy.source} /><ReviewItem label={copy.whyMatters} value={issueExplanation(a, copy)} /><ReviewItem label={copy.recommendedNextStep} value={recommendedAction(a, copy)} /></div><div className="mt-3 rounded-md border border-border/70 bg-surface p-3 text-sm text-text-muted"><span className="font-semibold text-text">{copy.advisorySummary} </span>{a.summary || copy.noAdvisory}{a.detailsUrl ? <a className="ml-2 text-accent" href={a.detailsUrl} target="_blank" rel="noreferrer">{copy.openAdvisory} →</a> : null}</div></div>)}</div></section>
}

function issueExplanation(a: Advisory, copy: CyberCopy) { if (a.severity === 'critical') return `${copy.critical}: ${a.summary}`; if (a.severity === 'high') return `${copy.high}: ${a.summary}`; if (a.severity === 'medium') return `${copy.medium}: ${a.summary}`; if (a.severity === 'low') return `${copy.low}: ${a.summary}`; return a.summary || copy.noAdvisory }
function recommendedAction(a: Advisory, copy: CyberCopy) { const fixed = Array.isArray(a.fixedVersions) && a.fixedVersions[0] ? a.fixedVersions[0] : ''; return fixed ? `${copy.prepareFixPlan}: ${a.packageName} ${a.version} → ${fixed}` : copy.prepareDescription }
function ReviewMetric({ label, value }: { label: string; value: number }) { return <div className="rounded-md border border-border bg-bg p-3"><div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div><div className="mt-1 text-xl font-semibold text-text">{value}</div></div> }
function ReviewItem({ label, value }: { label: string; value: string }) { return <div><div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</div><p className="mt-1 text-sm leading-relaxed text-text-muted">{value}</p></div> }
function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) { const toneCls = tone ? sevClass[tone] : 'border-border bg-surface text-text'; return <div className={`rounded-md border p-4 ${toneCls}`}><div className="text-xs uppercase tracking-wider opacity-70">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div> }
