export type DataCenterUiLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export const DATA_CENTER_OPERATIONS_COPY = {
  title: {
    en: 'Data Center Operations Intelligence', es: 'Inteligencia de operaciones de centros de datos', pt: 'Inteligência de operações de data center', pl: 'Inteligencja operacyjna centrum danych', ru: 'Операционная аналитика дата-центра',
  },
  subtitle: {
    en: 'Sandbox evidence → conservative correlation → COS advisory diagnosis.', es: 'Evidencia de sandbox → correlación conservadora → diagnóstico consultivo de COS.', pt: 'Evidência de sandbox → correlação conservadora → diagnóstico consultivo do COS.', pl: 'Dane z piaskownicy → ostrożna korelacja → doradcza diagnoza COS.', ru: 'Данные песочницы → консервативная корреляция → консультативная диагностика COS.',
  },
  safety: {
    en: 'Phase 1 is read-only. COS has no facility-control authority.', es: 'La fase 1 es de solo lectura. COS no tiene autoridad para controlar instalaciones.', pt: 'A Fase 1 é somente leitura. O COS não tem autoridade para controlar instalações.', pl: 'Faza 1 jest tylko do odczytu. COS nie ma uprawnień do sterowania obiektem.', ru: 'Этап 1 работает только на чтение. COS не имеет полномочий управлять оборудованием объекта.',
  },
  cooling: { en: 'Texas — Cooling loop degradation', es: 'Texas — Degradación del circuito de refrigeración', pt: 'Texas — Degradação do circuito de resfriamento', pl: 'Teksas — Degradacja pętli chłodzenia', ru: 'Техас — Деградация контура охлаждения' },
  pdu: { en: 'Arizona — PDU overload', es: 'Arizona — Sobrecarga de PDU', pt: 'Arizona — Sobrecarga de PDU', pl: 'Arizona — Przeciążenie PDU', ru: 'Аризона — Перегрузка PDU' },
  unrelated: { en: 'Texas — Unrelated concurrent alerts', es: 'Texas — Alertas simultáneas no relacionadas', pt: 'Texas — Alertas simultâneos não relacionados', pl: 'Teksas — Niezależne równoczesne alerty', ru: 'Техас — Несвязанные одновременные оповещения' },
  run: { en: 'Run COS simulation', es: 'Ejecutar simulación COS', pt: 'Executar simulação COS', pl: 'Uruchom symulację COS', ru: 'Запустить симуляцию COS' },
  running: { en: 'Analyzing…', es: 'Analizando…', pt: 'Analisando…', pl: 'Analizowanie…', ru: 'Анализ…' },
  observations: { en: 'Observed evidence', es: 'Evidencia observada', pt: 'Evidência observada', pl: 'Zaobserwowane dane', ru: 'Наблюдаемые данные' },
  clusters: { en: 'Correlation clusters', es: 'Grupos de correlación', pt: 'Clusters de correlação', pl: 'Klastry korelacji', ru: 'Кластеры корреляции' },
  diagnostics: { en: 'COS advisory diagnosis', es: 'Diagnóstico consultivo de COS', pt: 'Diagnóstico consultivo do COS', pl: 'Doradcza diagnoza COS', ru: 'Консультативная диагностика COS' },
  facts: { en: 'Observed facts', es: 'Hechos observados', pt: 'Fatos observados', pl: 'Zaobserwowane fakty', ru: 'Наблюдаемые факты' },
  hypotheses: { en: 'Hypotheses — not proven root cause', es: 'Hipótesis — no son causa raíz probada', pt: 'Hipóteses — não são causa raiz comprovada', pl: 'Hipotezy — nie są udowodnioną przyczyną', ru: 'Гипотезы — не доказанная первопричина' },
  checks: { en: 'Recommended operator checks', es: 'Comprobaciones recomendadas para el operador', pt: 'Verificações recomendadas ao operador', pl: 'Zalecane kontrole operatora', ru: 'Рекомендуемые проверки оператора' },
  missing: { en: 'Missing evidence', es: 'Evidencia faltante', pt: 'Evidência ausente', pl: 'Brakujące dane', ru: 'Недостающие данные' },
  none: { en: 'None reported', es: 'Ninguno informado', pt: 'Nenhum informado', pl: 'Brak', ru: 'Не указано' },
  failed: { en: 'Simulation failed', es: 'La simulación falló', pt: 'A simulação falhou', pl: 'Symulacja nie powiodła się', ru: 'Симуляция не удалась' },
  rootCause: { en: 'Root cause status', es: 'Estado de causa raíz', pt: 'Status da causa raiz', pl: 'Status przyczyny źródłowej', ru: 'Статус первопричины' },
  control: { en: 'Facility control', es: 'Control de instalaciones', pt: 'Controle da instalação', pl: 'Sterowanie obiektem', ru: 'Управление объектом' },
  disabled: { en: 'Disabled', es: 'Deshabilitado', pt: 'Desativado', pl: 'Wyłączone', ru: 'Отключено' },
} satisfies Record<string, Record<DataCenterUiLang, string>>

export function dataCenterUiText(key: keyof typeof DATA_CENTER_OPERATIONS_COPY, language: string): string {
  const safe = (['en', 'es', 'pt', 'pl', 'ru'].includes(language) ? language : 'en') as DataCenterUiLang
  return DATA_CENTER_OPERATIONS_COPY[key][safe]
}
