export type OperationsDashboardLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type OperationsDashboardCopy = Readonly<{
  eyebrow: string
  title: string
  description: string
  generated: string
  executiveSummary: string
  organization: string
  operationalHealth: string
  criticalIncidents: string
  openIncidents: string
  verificationSuccess: string
  learningConfidence: string
  trustedPlaybooks: string
  totalOpenIncidents: string
  resolvedIncidents: string
  verified: string
  failed: string
  verifiedLearningSamples: string
  totalPlaybooks: string
  verification: string
  completed: string
  inconclusive: string
  averageConfidence: string
  learning: string
  acceptedSamples: string
  ignoredOutcomes: string
  strategies: string
  recommendationConfidence: string
  playbookStatus: string
  trusted: string
  recommended: string
  candidate: string
  deprecated: string
  recentIncidentReferences: string
  noIncidentReferences: string
  openSummary: string
  criticalSummary: string
  awaitingVerification: string
  awaitingClosureApproval: string
  stateGreen: string
  stateYellow: string
  stateRed: string
}>

export const operationsDashboardCopy: Readonly<Record<OperationsDashboardLocale, OperationsDashboardCopy>> = {
  en: {
    eyebrow: 'Mission 003 · Executive Dashboard', title: 'Operations Intelligence',
    description: 'Read-only executive visibility from the Operations Intelligence API. No repair, approval, execution, or learning controls are exposed here.',
    generated: 'Generated', executiveSummary: 'Executive Summary', organization: 'Organization', operationalHealth: 'Operational Health',
    criticalIncidents: 'Critical Incidents', openIncidents: 'Open Incidents', verificationSuccess: 'Verification Success', learningConfidence: 'Learning Confidence', trustedPlaybooks: 'Trusted Playbooks',
    totalOpenIncidents: 'total open incidents', resolvedIncidents: 'resolved incidents', verified: 'verified', failed: 'failed', verifiedLearningSamples: 'verified learning samples', totalPlaybooks: 'total playbooks',
    verification: 'Verification', completed: 'Completed', inconclusive: 'Inconclusive', averageConfidence: 'Average confidence', learning: 'Learning', acceptedSamples: 'Accepted samples', ignoredOutcomes: 'Ignored outcomes', strategies: 'Strategies', recommendationConfidence: 'Recommendation confidence',
    playbookStatus: 'Playbook Status', trusted: 'Trusted', recommended: 'Recommended', candidate: 'Candidate', deprecated: 'Deprecated', recentIncidentReferences: 'Recent Incident References', noIncidentReferences: 'No incident references were returned by the Operations Intelligence API.',
    openSummary: 'open incidents', criticalSummary: 'critical', awaitingVerification: 'awaiting verification', awaitingClosureApproval: 'awaiting closure approval', stateGreen: 'Green', stateYellow: 'Yellow', stateRed: 'Red',
  },
  es: {
    eyebrow: 'Misión 003 · Panel Ejecutivo', title: 'Inteligencia de Operaciones',
    description: 'Visibilidad ejecutiva de solo lectura desde la API de Inteligencia de Operaciones. Aquí no se muestran controles de reparación, aprobación, ejecución ni aprendizaje.',
    generated: 'Generado', executiveSummary: 'Resumen Ejecutivo', organization: 'Organización', operationalHealth: 'Salud Operativa',
    criticalIncidents: 'Incidentes Críticos', openIncidents: 'Incidentes Abiertos', verificationSuccess: 'Éxito de Verificación', learningConfidence: 'Confianza de Aprendizaje', trustedPlaybooks: 'Guías Confiables',
    totalOpenIncidents: 'incidentes abiertos en total', resolvedIncidents: 'incidentes resueltos', verified: 'verificados', failed: 'fallidos', verifiedLearningSamples: 'muestras de aprendizaje verificadas', totalPlaybooks: 'guías en total',
    verification: 'Verificación', completed: 'Completadas', inconclusive: 'No concluyentes', averageConfidence: 'Confianza promedio', learning: 'Aprendizaje', acceptedSamples: 'Muestras aceptadas', ignoredOutcomes: 'Resultados ignorados', strategies: 'Estrategias', recommendationConfidence: 'Confianza de recomendación',
    playbookStatus: 'Estado de las Guías', trusted: 'Confiables', recommended: 'Recomendadas', candidate: 'Candidatas', deprecated: 'Obsoletas', recentIncidentReferences: 'Referencias de Incidentes Recientes', noIncidentReferences: 'La API de Inteligencia de Operaciones no devolvió referencias de incidentes.',
    openSummary: 'incidentes abiertos', criticalSummary: 'críticos', awaitingVerification: 'en espera de verificación', awaitingClosureApproval: 'en espera de aprobación de cierre', stateGreen: 'Verde', stateYellow: 'Amarillo', stateRed: 'Rojo',
  },
  pt: {
    eyebrow: 'Missão 003 · Painel Executivo', title: 'Inteligência de Operações',
    description: 'Visibilidade executiva somente leitura da API de Inteligência de Operações. Nenhum controle de reparo, aprovação, execução ou aprendizado é exposto aqui.',
    generated: 'Gerado', executiveSummary: 'Resumo Executivo', organization: 'Organização', operationalHealth: 'Saúde Operacional',
    criticalIncidents: 'Incidentes Críticos', openIncidents: 'Incidentes Abertos', verificationSuccess: 'Sucesso da Verificação', learningConfidence: 'Confiança do Aprendizado', trustedPlaybooks: 'Guias Confiáveis',
    totalOpenIncidents: 'incidentes abertos no total', resolvedIncidents: 'incidentes resolvidos', verified: 'verificados', failed: 'com falha', verifiedLearningSamples: 'amostras de aprendizado verificadas', totalPlaybooks: 'guias no total',
    verification: 'Verificação', completed: 'Concluídas', inconclusive: 'Inconclusivas', averageConfidence: 'Confiança média', learning: 'Aprendizado', acceptedSamples: 'Amostras aceitas', ignoredOutcomes: 'Resultados ignorados', strategies: 'Estratégias', recommendationConfidence: 'Confiança da recomendação',
    playbookStatus: 'Status dos Guias', trusted: 'Confiáveis', recommended: 'Recomendados', candidate: 'Candidatos', deprecated: 'Descontinuados', recentIncidentReferences: 'Referências de Incidentes Recentes', noIncidentReferences: 'A API de Inteligência de Operações não retornou referências de incidentes.',
    openSummary: 'incidentes abertos', criticalSummary: 'críticos', awaitingVerification: 'aguardando verificação', awaitingClosureApproval: 'aguardando aprovação de encerramento', stateGreen: 'Verde', stateYellow: 'Amarelo', stateRed: 'Vermelho',
  },
  pl: {
    eyebrow: 'Misja 003 · Panel Kierowniczy', title: 'Inteligencja Operacyjna',
    description: 'Widok kierowniczy tylko do odczytu z API Inteligencji Operacyjnej. Nie ma tu kontroli naprawy, zatwierdzania, wykonania ani uczenia.',
    generated: 'Wygenerowano', executiveSummary: 'Podsumowanie Kierownicze', organization: 'Organizacja', operationalHealth: 'Stan Operacyjny',
    criticalIncidents: 'Incydenty Krytyczne', openIncidents: 'Otwarte Incydenty', verificationSuccess: 'Skuteczność Weryfikacji', learningConfidence: 'Pewność Uczenia', trustedPlaybooks: 'Zaufane Procedury',
    totalOpenIncidents: 'wszystkich otwartych incydentów', resolvedIncidents: 'rozwiązanych incydentów', verified: 'zweryfikowanych', failed: 'nieudanych', verifiedLearningSamples: 'zweryfikowanych próbek uczenia', totalPlaybooks: 'wszystkich procedur',
    verification: 'Weryfikacja', completed: 'Zakończone', inconclusive: 'Nierozstrzygające', averageConfidence: 'Średnia pewność', learning: 'Uczenie', acceptedSamples: 'Przyjęte próbki', ignoredOutcomes: 'Pominięte wyniki', strategies: 'Strategie', recommendationConfidence: 'Pewność rekomendacji',
    playbookStatus: 'Status Procedur', trusted: 'Zaufane', recommended: 'Rekomendowane', candidate: 'Kandydackie', deprecated: 'Wycofane', recentIncidentReferences: 'Ostatnie Odwołania do Incydentów', noIncidentReferences: 'API Inteligencji Operacyjnej nie zwróciło odwołań do incydentów.',
    openSummary: 'otwartych incydentów', criticalSummary: 'krytycznych', awaitingVerification: 'oczekuje na weryfikację', awaitingClosureApproval: 'oczekuje na zgodę na zamknięcie', stateGreen: 'Zielony', stateYellow: 'Żółty', stateRed: 'Czerwony',
  },
  ru: {
    eyebrow: 'Миссия 003 · Панель Руководителя', title: 'Операционная Аналитика',
    description: 'Исполнительный обзор только для чтения из API операционной аналитики. Здесь нет управления ремонтом, утверждением, выполнением или обучением.',
    generated: 'Сформировано', executiveSummary: 'Сводка для Руководства', organization: 'Организация', operationalHealth: 'Операционное Состояние',
    criticalIncidents: 'Критические Инциденты', openIncidents: 'Открытые Инциденты', verificationSuccess: 'Успех Проверки', learningConfidence: 'Достоверность Обучения', trustedPlaybooks: 'Надёжные Сценарии',
    totalOpenIncidents: 'всего открытых инцидентов', resolvedIncidents: 'решённых инцидентов', verified: 'подтверждено', failed: 'с ошибкой', verifiedLearningSamples: 'подтверждённых образцов обучения', totalPlaybooks: 'всего сценариев',
    verification: 'Проверка', completed: 'Завершено', inconclusive: 'Без результата', averageConfidence: 'Средняя достоверность', learning: 'Обучение', acceptedSamples: 'Принятые образцы', ignoredOutcomes: 'Пропущенные результаты', strategies: 'Стратегии', recommendationConfidence: 'Достоверность рекомендации',
    playbookStatus: 'Статус Сценариев', trusted: 'Надёжные', recommended: 'Рекомендуемые', candidate: 'Кандидаты', deprecated: 'Устаревшие', recentIncidentReferences: 'Последние Ссылки на Инциденты', noIncidentReferences: 'API операционной аналитики не вернуло ссылок на инциденты.',
    openSummary: 'открытых инцидентов', criticalSummary: 'критических', awaitingVerification: 'ожидают проверки', awaitingClosureApproval: 'ожидают утверждения закрытия', stateGreen: 'Зелёный', stateYellow: 'Жёлтый', stateRed: 'Красный',
  },
}

export function getOperationsDashboardCopy(locale: string): OperationsDashboardCopy {
  return operationsDashboardCopy[(locale in operationsDashboardCopy ? locale : 'en') as OperationsDashboardLocale]
}
