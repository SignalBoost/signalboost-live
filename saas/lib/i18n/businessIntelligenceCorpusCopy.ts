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
  prospectTitle: string
  prospectDescription: string
  prospectDryRun: string
  prospectDryRunning: string
  prospectApply: string
  prospectApplying: string
  prospectOwnerOnly: string
  prospectReviewReady: string
  prospectDryRunRequired: string
  prospectSnapshotChanged: string
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
    prospectTitle: 'Validated prospect history',
    prospectDescription: 'Preview company identities recovered from SignalBoost-owned prospect campaign history. Only candidates that pass the conservative corpus validation rules are eligible.',
    prospectDryRun: 'Dry run validated prospect history',
    prospectDryRunning: 'Running validation preview…',
    prospectApply: 'Apply reviewed candidates',
    prospectApplying: 'Applying reviewed candidates…',
    prospectOwnerOnly: 'Owner-only. Dry run first. Uses stored SignalBoost history only, with zero external AI and zero external prospect-provider calls.',
    prospectReviewReady: 'Dry run complete. Review the exact candidate snapshot below before applying it.',
    prospectDryRunRequired: 'Run a successful dry run before applying candidates.',
    prospectSnapshotChanged: 'The candidate snapshot changed after review. Nothing was applied. Run a new dry run and review the updated candidates.',
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
    prospectTitle: 'Historial de prospectos validado',
    prospectDescription: 'Previsualiza identidades de empresas recuperadas del historial de campañas de prospectos propiedad de SignalBoost. Solo son elegibles los candidatos que superan las reglas conservadoras de validación del corpus.',
    prospectDryRun: 'Simular historial de prospectos validado',
    prospectDryRunning: 'Ejecutando vista previa de validación…',
    prospectApply: 'Aplicar candidatos revisados',
    prospectApplying: 'Aplicando candidatos revisados…',
    prospectOwnerOnly: 'Solo propietario. Primero ejecuta la simulación. Usa únicamente el historial almacenado de SignalBoost, sin IA externa ni proveedores externos de datos de prospectos.',
    prospectReviewReady: 'Simulación completada. Revisa la instantánea exacta de candidatos antes de aplicarla.',
    prospectDryRunRequired: 'Ejecuta una simulación correcta antes de aplicar candidatos.',
    prospectSnapshotChanged: 'La instantánea de candidatos cambió después de la revisión. No se aplicó nada. Ejecuta una nueva simulación y revisa los candidatos actualizados.',
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
    prospectTitle: 'Histórico de prospectos validado',
    prospectDescription: 'Visualize identidades de empresas recuperadas do histórico de campanhas de prospecção pertencente à SignalBoost. Somente candidatos que passam pelas regras conservadoras de validação do corpus são elegíveis.',
    prospectDryRun: 'Simular histórico de prospectos validado',
    prospectDryRunning: 'Executando prévia de validação…',
    prospectApply: 'Aplicar candidatos revisados',
    prospectApplying: 'Aplicando candidatos revisados…',
    prospectOwnerOnly: 'Somente proprietário. Execute primeiro a simulação. Usa apenas o histórico armazenado da SignalBoost, sem IA externa e sem provedores externos de dados de prospecção.',
    prospectReviewReady: 'Simulação concluída. Revise a lista exata de candidatos abaixo antes de aplicá-la.',
    prospectDryRunRequired: 'Execute uma simulação bem-sucedida antes de aplicar candidatos.',
    prospectSnapshotChanged: 'A lista de candidatos mudou após a revisão. Nada foi aplicado. Execute uma nova simulação e revise os candidatos atualizados.',
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
    prospectTitle: 'Zweryfikowana historia potencjalnych klientów',
    prospectDescription: 'Wyświetl podgląd tożsamości firm odzyskanych z historii kampanii prospectingowych należącej do SignalBoost. Kwalifikują się wyłącznie kandydaci spełniający konserwatywne reguły walidacji korpusu.',
    prospectDryRun: 'Uruchom próbę zweryfikowanej historii',
    prospectDryRunning: 'Uruchamianie podglądu walidacji…',
    prospectApply: 'Zastosuj sprawdzonych kandydatów',
    prospectApplying: 'Stosowanie sprawdzonych kandydatów…',
    prospectOwnerOnly: 'Tylko właściciel. Najpierw uruchom próbę. Używa wyłącznie zapisanej historii SignalBoost, bez zewnętrznej AI i bez zewnętrznych dostawców danych prospectingowych.',
    prospectReviewReady: 'Próba zakończona. Przed zastosowaniem sprawdź dokładną listę kandydatów poniżej.',
    prospectDryRunRequired: 'Przed zastosowaniem kandydatów uruchom poprawną próbę.',
    prospectSnapshotChanged: 'Lista kandydatów zmieniła się po przeglądzie. Niczego nie zastosowano. Uruchom nową próbę i sprawdź zaktualizowanych kandydatów.',
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
    prospectTitle: 'Проверенная история потенциальных клиентов',
    prospectDescription: 'Предварительный просмотр компаний, восстановленных из принадлежащей SignalBoost истории кампаний по поиску клиентов. Допускаются только кандидаты, прошедшие консервативные правила проверки корпуса.',
    prospectDryRun: 'Проверить историю без применения',
    prospectDryRunning: 'Выполняется предварительная проверка…',
    prospectApply: 'Применить проверенных кандидатов',
    prospectApplying: 'Применение проверенных кандидатов…',
    prospectOwnerOnly: 'Только для владельца. Сначала выполните проверку без применения. Используется только сохранённая история SignalBoost, без внешнего ИИ и без внешних поставщиков данных о потенциальных клиентах.',
    prospectReviewReady: 'Предварительная проверка завершена. Перед применением проверьте точный список кандидатов ниже.',
    prospectDryRunRequired: 'Перед применением кандидатов выполните успешную предварительную проверку.',
    prospectSnapshotChanged: 'Список кандидатов изменился после проверки. Ничего не было применено. Выполните новую предварительную проверку и просмотрите обновлённый список.',
  },
}
