// saas/lib/i18n/cosUniversityTelemetryCopy.ts
export type CosUniversityTelemetryLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type Copy = Readonly<{
  title: string
  subtitle: string
  updated: string
  refresh: string
  refreshing: string
  ownerRequired: string
  requestFailed: string
  teacherOutputs24h: string
  completedRuns24h: string
  inFlight24h: string
  failedRuns24h: string
  hfObservedCost24h: string
  providersTitle: string
  providersExplanation: string
  teacherCalls: string
  input: string
  output: string
  latest: string
  noTeacherCalls: string
  runsTitle: string
  runsExplanation: string
  subject: string
  stage: string
  teacherMix: string
  outputs: string
  preparation: string
  training: string
  campaignBudget: string
  noRuns: string
  footer: string
  unknownSubject: string
  unknownStage: string
}>

export const COS_UNIVERSITY_TELEMETRY_COPY: Record<CosUniversityTelemetryLanguage, Copy> = {
  en: {
    title: 'COS University — Distillation Telemetry',
    subtitle: 'Read-only Production view. Auto-refreshes every 10 seconds.',
    updated: 'Updated',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    ownerRequired: 'Owner sign-in is required to view University production telemetry.',
    requestFailed: 'Telemetry request failed',
    teacherOutputs24h: 'Teacher outputs · 24h',
    completedRuns24h: 'Completed runs · 24h',
    inFlight24h: 'In flight · 24h',
    failedRuns24h: 'Failed runs · 24h',
    hfObservedCost24h: 'HF observed cost · 24h',
    providersTitle: 'Frontier teacher providers · last 24h',
    providersExplanation: 'Calls and tokens are durable API telemetry. Provider account charges are not inferred here.',
    teacherCalls: 'teacher calls',
    input: 'Input',
    output: 'Output',
    latest: 'Latest',
    noTeacherCalls: 'No hosted teacher calls in this window.',
    runsTitle: 'Recent distillation runs',
    runsExplanation: 'Newest Production activity first.',
    subject: 'Subject',
    stage: 'Stage',
    teacherMix: 'Teacher mix',
    outputs: 'Outputs',
    preparation: 'Preparation',
    training: 'Training',
    campaignBudget: 'Campaign budget',
    noRuns: 'No runs found.',
    footer: 'This surface is read-only. It does not authorize spend, retrigger jobs, change providers, or promote artifacts.',
    unknownSubject: 'Unknown subject',
    unknownStage: 'Unknown',
  },
  es: {
    title: 'COS University — Telemetría de destilación',
    subtitle: 'Vista de Producción de solo lectura. Se actualiza automáticamente cada 10 segundos.',
    updated: 'Actualizado',
    refresh: 'Actualizar',
    refreshing: 'Actualizando…',
    ownerRequired: 'Se requiere iniciar sesión como propietario para ver la telemetría de Producción de University.',
    requestFailed: 'Falló la solicitud de telemetría',
    teacherOutputs24h: 'Salidas de profesores · 24 h',
    completedRuns24h: 'Ejecuciones completadas · 24 h',
    inFlight24h: 'En curso · 24 h',
    failedRuns24h: 'Ejecuciones fallidas · 24 h',
    hfObservedCost24h: 'Costo observado de HF · 24 h',
    providersTitle: 'Proveedores docentes frontier · últimas 24 h',
    providersExplanation: 'Las llamadas y los tokens son telemetría duradera de API. Aquí no se infieren cargos de las cuentas de los proveedores.',
    teacherCalls: 'llamadas docentes',
    input: 'Entrada',
    output: 'Salida',
    latest: 'Última',
    noTeacherCalls: 'No hubo llamadas docentes alojadas en esta ventana.',
    runsTitle: 'Ejecuciones recientes de destilación',
    runsExplanation: 'La actividad de Producción más reciente aparece primero.',
    subject: 'Materia',
    stage: 'Etapa',
    teacherMix: 'Mezcla docente',
    outputs: 'Salidas',
    preparation: 'Preparación',
    training: 'Entrenamiento',
    campaignBudget: 'Presupuesto de campaña',
    noRuns: 'No se encontraron ejecuciones.',
    footer: 'Esta vista es de solo lectura. No autoriza gasto, reintentos de trabajos, cambios de proveedor ni promoción de artefactos.',
    unknownSubject: 'Materia desconocida',
    unknownStage: 'Desconocida',
  },
  pt: {
    title: 'COS University — Telemetria de destilação',
    subtitle: 'Visualização de Produção somente leitura. Atualização automática a cada 10 segundos.',
    updated: 'Atualizado',
    refresh: 'Atualizar',
    refreshing: 'Atualizando…',
    ownerRequired: 'É necessário entrar como proprietário para ver a telemetria de Produção da University.',
    requestFailed: 'Falha na solicitação de telemetria',
    teacherOutputs24h: 'Saídas dos professores · 24 h',
    completedRuns24h: 'Execuções concluídas · 24 h',
    inFlight24h: 'Em andamento · 24 h',
    failedRuns24h: 'Execuções com falha · 24 h',
    hfObservedCost24h: 'Custo observado do HF · 24 h',
    providersTitle: 'Provedores professores frontier · últimas 24 h',
    providersExplanation: 'Chamadas e tokens são telemetria persistente de API. Os custos das contas dos provedores não são inferidos aqui.',
    teacherCalls: 'chamadas de professor',
    input: 'Entrada',
    output: 'Saída',
    latest: 'Mais recente',
    noTeacherCalls: 'Nenhuma chamada de professor hospedado nesta janela.',
    runsTitle: 'Execuções recentes de destilação',
    runsExplanation: 'Atividade de Produção mais recente primeiro.',
    subject: 'Assunto',
    stage: 'Etapa',
    teacherMix: 'Mix de professores',
    outputs: 'Saídas',
    preparation: 'Preparação',
    training: 'Treinamento',
    campaignBudget: 'Orçamento da campanha',
    noRuns: 'Nenhuma execução encontrada.',
    footer: 'Esta tela é somente leitura. Ela não autoriza gastos, reexecução de jobs, troca de provedores ou promoção de artefatos.',
    unknownSubject: 'Assunto desconhecido',
    unknownStage: 'Desconhecida',
  },
  pl: {
    title: 'COS University — Telemetria destylacji',
    subtitle: 'Widok Produkcji tylko do odczytu. Automatyczne odświeżanie co 10 sekund.',
    updated: 'Zaktualizowano',
    refresh: 'Odśwież',
    refreshing: 'Odświeżanie…',
    ownerRequired: 'Aby zobaczyć telemetrię Produkcji University, wymagane jest logowanie właściciela.',
    requestFailed: 'Żądanie telemetrii nie powiodło się',
    teacherOutputs24h: 'Wyniki nauczycieli · 24 h',
    completedRuns24h: 'Ukończone przebiegi · 24 h',
    inFlight24h: 'W toku · 24 h',
    failedRuns24h: 'Nieudane przebiegi · 24 h',
    hfObservedCost24h: 'Zaobserwowany koszt HF · 24 h',
    providersTitle: 'Dostawcy nauczycieli frontier · ostatnie 24 h',
    providersExplanation: 'Wywołania i tokeny są trwałą telemetrią API. Opłaty kont dostawców nie są tutaj szacowane.',
    teacherCalls: 'wywołania nauczyciela',
    input: 'Wejście',
    output: 'Wyjście',
    latest: 'Ostatnie',
    noTeacherCalls: 'Brak wywołań hostowanych nauczycieli w tym oknie.',
    runsTitle: 'Ostatnie przebiegi destylacji',
    runsExplanation: 'Najnowsza aktywność Produkcji jest wyświetlana jako pierwsza.',
    subject: 'Temat',
    stage: 'Etap',
    teacherMix: 'Miks nauczycieli',
    outputs: 'Wyniki',
    preparation: 'Przygotowanie',
    training: 'Trening',
    campaignBudget: 'Budżet kampanii',
    noRuns: 'Nie znaleziono przebiegów.',
    footer: 'Ten widok jest tylko do odczytu. Nie autoryzuje wydatków, ponawiania zadań, zmian dostawców ani promocji artefaktów.',
    unknownSubject: 'Nieznany temat',
    unknownStage: 'Nieznany',
  },
  ru: {
    title: 'COS University — Телеметрия дистилляции',
    subtitle: 'Производственный режим только для чтения. Автообновление каждые 10 секунд.',
    updated: 'Обновлено',
    refresh: 'Обновить',
    refreshing: 'Обновление…',
    ownerRequired: 'Для просмотра производственной телеметрии University требуется вход владельца.',
    requestFailed: 'Запрос телеметрии не выполнен',
    teacherOutputs24h: 'Ответы учителей · 24 ч',
    completedRuns24h: 'Завершённые запуски · 24 ч',
    inFlight24h: 'В работе · 24 ч',
    failedRuns24h: 'Неудачные запуски · 24 ч',
    hfObservedCost24h: 'Наблюдаемая стоимость HF · 24 ч',
    providersTitle: 'Провайдеры frontier-учителей · последние 24 ч',
    providersExplanation: 'Вызовы и токены — сохранённая API-телеметрия. Списания со счетов провайдеров здесь не рассчитываются.',
    teacherCalls: 'вызовы учителя',
    input: 'Вход',
    output: 'Выход',
    latest: 'Последний',
    noTeacherCalls: 'В этом окне нет вызовов размещённых учителей.',
    runsTitle: 'Недавние запуски дистилляции',
    runsExplanation: 'Сначала показана самая свежая производственная активность.',
    subject: 'Предмет',
    stage: 'Этап',
    teacherMix: 'Состав учителей',
    outputs: 'Ответы',
    preparation: 'Подготовка',
    training: 'Обучение',
    campaignBudget: 'Бюджет кампании',
    noRuns: 'Запуски не найдены.',
    footer: 'Этот экран только для чтения. Он не разрешает расходы, перезапуск задач, смену провайдеров или продвижение артефактов.',
    unknownSubject: 'Неизвестный предмет',
    unknownStage: 'Неизвестен',
  },
}
