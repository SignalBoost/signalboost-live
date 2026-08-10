export type BusinessIntelligenceCorpusCopy = {
  eyebrow: string
  title: string
  description: string
  companies: string
  target: string
  complete: string
  importing: string
  importHistory: string
  ownerOnly: string
  importFailed: string
  operationalTitle: string
  lookups: string
  internalResolutions: string
  providerCalls: string
  providerAvoidance: string
  averageConfidence: string
  averageLatency: string
  internalFirstPolicy: string
  metricsUnavailable: string
}

export const BUSINESS_INTELLIGENCE_CORPUS_COPY: Record<string, BusinessIntelligenceCorpusCopy> = {
  en: {
    eyebrow: 'Business Intelligence Corpus',
    title: 'Internal company intelligence',
    description: 'Reuse company intelligence SignalBoost already discovered before spending money on external AI or data providers.',
    companies: 'Companies',
    target: 'Target',
    complete: 'Complete',
    importing: 'Importing existing outreach history…',
    importHistory: 'Import existing outreach history',
    ownerOnly: 'Owner-only. Uses existing outreach history and does not call paid AI or prospect-data providers.',
    importFailed: 'Import failed',
    operationalTitle: 'Internal-first usage',
    lookups: 'Lookups',
    internalResolutions: 'Internal resolutions',
    providerCalls: 'Provider calls',
    providerAvoidance: 'Provider avoidance',
    averageConfidence: 'Average confidence',
    averageLatency: 'Average latency',
    internalFirstPolicy: 'COS checks internal intelligence first and only falls back to external providers when confidence or freshness is insufficient.',
    metricsUnavailable: 'Usage metrics will appear after corpus lookups are recorded.',
  },
  es: {
    eyebrow: 'Corpus de inteligencia empresarial',
    title: 'Inteligencia interna de empresas',
    description: 'Reutiliza la inteligencia empresarial que SignalBoost ya descubrió antes de gastar dinero en IA externa o proveedores de datos.',
    companies: 'Empresas',
    target: 'Objetivo',
    complete: 'Completado',
    importing: 'Importando el historial de alcance existente…',
    importHistory: 'Importar historial de alcance existente',
    ownerOnly: 'Solo propietario. Usa el historial de alcance existente y no llama a proveedores de IA o datos de prospectos de pago.',
    importFailed: 'Error de importación',
    operationalTitle: 'Uso interno primero',
    lookups: 'Consultas',
    internalResolutions: 'Resoluciones internas',
    providerCalls: 'Llamadas a proveedores',
    providerAvoidance: 'Proveedores evitados',
    averageConfidence: 'Confianza media',
    averageLatency: 'Latencia media',
    internalFirstPolicy: 'COS consulta primero la inteligencia interna y solo recurre a proveedores externos cuando la confianza o la vigencia son insuficientes.',
    metricsUnavailable: 'Las métricas de uso aparecerán después de registrar consultas del corpus.',
  },
  pt: {
    eyebrow: 'Corpus de inteligência empresarial',
    title: 'Inteligência interna de empresas',
    description: 'Reutilize a inteligência empresarial que a SignalBoost já descobriu antes de gastar dinheiro com IA externa ou provedores de dados.',
    companies: 'Empresas',
    target: 'Meta',
    complete: 'Concluído',
    importing: 'Importando o histórico de prospecção existente…',
    importHistory: 'Importar histórico de prospecção existente',
    ownerOnly: 'Somente proprietário. Usa o histórico de prospecção existente e não chama provedores pagos de IA ou dados de prospecção.',
    importFailed: 'Falha na importação',
    operationalTitle: 'Uso interno primeiro',
    lookups: 'Consultas',
    internalResolutions: 'Resoluções internas',
    providerCalls: 'Chamadas a provedores',
    providerAvoidance: 'Provedores evitados',
    averageConfidence: 'Confiança média',
    averageLatency: 'Latência média',
    internalFirstPolicy: 'O COS consulta primeiro a inteligência interna e só usa provedores externos quando a confiança ou a atualidade forem insuficientes.',
    metricsUnavailable: 'As métricas de uso aparecerão depois que consultas ao corpus forem registradas.',
  },
  pl: {
    eyebrow: 'Korpus analityki biznesowej',
    title: 'Wewnętrzna wiedza o firmach',
    description: 'Wykorzystuj ponownie wiedzę o firmach już zdobytą przez SignalBoost, zanim wydasz pieniądze na zewnętrzną AI lub dostawców danych.',
    companies: 'Firmy',
    target: 'Cel',
    complete: 'Ukończono',
    importing: 'Importowanie istniejącej historii działań…',
    importHistory: 'Importuj istniejącą historię działań',
    ownerOnly: 'Tylko właściciel. Korzysta z istniejącej historii działań i nie wywołuje płatnych dostawców AI ani danych prospectingowych.',
    importFailed: 'Import nie powiódł się',
    operationalTitle: 'Najpierw dane wewnętrzne',
    lookups: 'Wyszukania',
    internalResolutions: 'Rozwiązania wewnętrzne',
    providerCalls: 'Wywołania dostawców',
    providerAvoidance: 'Uniknięte wywołania',
    averageConfidence: 'Średnia pewność',
    averageLatency: 'Średnie opóźnienie',
    internalFirstPolicy: 'COS najpierw sprawdza wiedzę wewnętrzną i korzysta z dostawców zewnętrznych tylko wtedy, gdy pewność lub świeżość danych są niewystarczające.',
    metricsUnavailable: 'Metryki użycia pojawią się po zarejestrowaniu wyszukań w korpusie.',
  },
  ru: {
    eyebrow: 'Корпус бизнес-аналитики',
    title: 'Внутренняя информация о компаниях',
    description: 'Повторно используйте сведения о компаниях, уже найденные SignalBoost, прежде чем тратить деньги на внешние ИИ-сервисы или поставщиков данных.',
    companies: 'Компании',
    target: 'Цель',
    complete: 'Готово',
    importing: 'Импорт существующей истории охвата…',
    importHistory: 'Импортировать существующую историю охвата',
    ownerOnly: 'Только для владельца. Использует существующую историю охвата и не обращается к платным ИИ-сервисам или поставщикам данных о потенциальных клиентах.',
    importFailed: 'Ошибка импорта',
    operationalTitle: 'Сначала внутренние данные',
    lookups: 'Запросы',
    internalResolutions: 'Внутренние решения',
    providerCalls: 'Вызовы поставщиков',
    providerAvoidance: 'Избежанные вызовы',
    averageConfidence: 'Средняя уверенность',
    averageLatency: 'Средняя задержка',
    internalFirstPolicy: 'COS сначала проверяет внутреннюю информацию и обращается к внешним поставщикам только при недостаточной уверенности или свежести данных.',
    metricsUnavailable: 'Метрики использования появятся после регистрации запросов к корпусу.',
  },
}
