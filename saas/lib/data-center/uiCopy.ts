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
  rootCause: { en: 'Root cause status', es: 'Estado de causa raíz', pt: 'Status de causa raiz', pl: 'Status przyczyny źródłowej', ru: 'Статус первопричины' },
  control: { en: 'Facility control', es: 'Control de instalaciones', pt: 'Controle da instalação', pl: 'Sterowanie obiektem', ru: 'Управление объектом' },
  disabled: { en: 'Disabled', es: 'Deshabilitado', pt: 'Desativado', pl: 'Wyłączone', ru: 'Отключено' },
  benchmarkTitle: { en: 'Private data-center capability benchmark', es: 'Evaluación privada de capacidad de centros de datos', pt: 'Benchmark privado de capacidade de data center', pl: 'Prywatny benchmark zdolności centrum danych', ru: 'Закрытый тест возможностей для дата-центров' },
  benchmarkBody: { en: 'Runs the 14 hidden data-center cases in bounded two-case batches. Holdout prompts stay server-side and facility control remains disabled.', es: 'Ejecuta los 14 casos ocultos de centros de datos en lotes limitados de dos casos. Los prompts de evaluación permanecen en el servidor y el control de instalaciones sigue deshabilitado.', pt: 'Executa os 14 casos ocultos de data center em lotes limitados de dois casos. Os prompts de holdout permanecem no servidor e o controle da instalação continua desativado.', pl: 'Uruchamia 14 ukrytych przypadków centrum danych w ograniczonych partiach po dwa. Prompty holdout pozostają po stronie serwera, a sterowanie obiektem pozostaje wyłączone.', ru: 'Запускает 14 скрытых тестовых случаев дата-центра ограниченными пакетами по два. Holdout-промпты остаются на сервере, управление объектом отключено.' },
  benchmarkRun: { en: 'Run 14-case private benchmark', es: 'Ejecutar benchmark privado de 14 casos', pt: 'Executar benchmark privado de 14 casos', pl: 'Uruchom prywatny benchmark 14 przypadków', ru: 'Запустить закрытый тест из 14 случаев' },
  benchmarkRunning: { en: 'Running private benchmark…', es: 'Ejecutando benchmark privado…', pt: 'Executando benchmark privado…', pl: 'Uruchamianie prywatnego benchmarku…', ru: 'Выполняется закрытый тест…' },
  benchmarkCases: { en: 'Hidden cases', es: 'Casos ocultos', pt: 'Casos ocultos', pl: 'Ukryte przypadki', ru: 'Скрытые случаи' },
  benchmarkProgress: { en: 'Completed', es: 'Completados', pt: 'Concluídos', pl: 'Ukończono', ru: 'Завершено' },
  benchmarkPassed: { en: 'Passed', es: 'Aprobados', pt: 'Aprovados', pl: 'Zaliczone', ru: 'Пройдено' },
  benchmarkPassRate: { en: 'Pass rate', es: 'Tasa de aprobación', pt: 'Taxa de aprovação', pl: 'Wskaźnik zaliczeń', ru: 'Доля успешных' },
  benchmarkComplete: { en: 'Private benchmark completed.', es: 'Benchmark privado completado.', pt: 'Benchmark privado concluído.', pl: 'Prywatny benchmark zakończony.', ru: 'Закрытый тест завершён.' },
  benchmarkFailed: { en: 'Private benchmark failed', es: 'Falló el benchmark privado', pt: 'O benchmark privado falhou', pl: 'Prywatny benchmark nie powiódł się', ru: 'Закрытый тест завершился ошибкой' },
  benchmarkKeepOpen: { en: 'Keep this page open while the bounded batches run.', es: 'Mantén esta página abierta mientras se ejecutan los lotes limitados.', pt: 'Mantenha esta página aberta enquanto os lotes limitados são executados.', pl: 'Pozostaw tę stronę otwartą podczas wykonywania ograniczonych partii.', ru: 'Оставьте эту страницу открытой, пока выполняются ограниченные пакеты.' },
} satisfies Record<string, Record<DataCenterUiLang, string>>

export function dataCenterUiText(key: keyof typeof DATA_CENTER_OPERATIONS_COPY, language: string): string {
  const safe = (['en', 'es', 'pt', 'pl', 'ru'].includes(language) ? language : 'en') as DataCenterUiLang
  return DATA_CENTER_OPERATIONS_COPY[key][safe]
}
