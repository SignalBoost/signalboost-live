import type { SupervisorLocale } from '../portable/notification-copy.ts'
import { resolveSupervisorLocale } from '../portable/notification-copy.ts'
import type { ReasoningIncidentShape } from './types.ts'

interface ReasoningCopy {
  goal: (shape: string, target: string, message: string) => string
  diagnosisWithStrategy: (shape: string, strategyId: string) => string
  diagnosisRecognised: (shape: string) => string
  diagnosisUnclassified: string
  verifyRemediation: (target: string) => string
  verifyObservations: (target: string) => string
  expectedHealthy: string
  expectedObserved: string
  questions: Record<ReasoningIncidentShape, Array<[string, string]>>
}

const q = (pairs: Array<[string, string]>): Array<[string, string]> => pairs

const COPY: Record<SupervisorLocale, ReasoningCopy> = {
  en: {
    goal: (shape, target, message) => `Diagnose and safely remediate the reported ${shape} incident affecting ${target}: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `The incident matches the ${shape} failure shape and registered remediation strategy ${strategyId}. The plan begins with bounded diagnostic reads before proposing the strategy's remediation steps.`,
    diagnosisRecognised: shape => `The incident matches the ${shape} failure shape. No registered remediation strategy matched, so the plan remains diagnostic and does not mutate the target.`,
    diagnosisUnclassified: 'The incident did not match a known failure shape. No remediation strategy matched, so the plan gathers general state and remains read-only.',
    verifyRemediation: target => `Verify ${target} is healthy after remediation and no adjacent regression is observed`,
    verifyObservations: target => `Confirm the diagnostic observations for ${target} were gathered successfully`,
    expectedHealthy: 'target healthy and adjacent checks pass',
    expectedObserved: 'observations recorded',
    questions: {
      availability: q([['confirm-current-health', 'Confirm the affected resource is still unavailable'], ['inspect-dependencies', 'Inspect immediate dependency health'], ['inspect-recent-change', 'Inspect the most recent deployment or configuration change']]),
      deployment: q([['inspect-deployment', 'Inspect the current deployment or rollout state'], ['inspect-failure-evidence', 'Inspect the first failing build or rollout evidence'], ['compare-previous', 'Compare against the previously healthy revision']]),
      saturation: q([['confirm-saturation', 'Confirm the constrained resource is still saturated'], ['inspect-trend', 'Inspect recent utilization trend'], ['identify-consumer', 'Identify the largest workload or tenant consumer']]),
      latency: q([['confirm-latency', 'Confirm the reported latency is still elevated'], ['locate-slow-path', 'Locate the slow endpoint or operation'], ['inspect-dependencies', 'Inspect downstream dependency latency']]),
      errors: q([['confirm-error-rate', 'Confirm the reported error rate is still elevated'], ['sample-errors', 'Inspect representative failures for the dominant error'], ['inspect-recent-change', 'Inspect the most recent deployment or configuration change']]),
      data_freshness: q([['confirm-freshness', 'Confirm the data is still stale'], ['inspect-producer', 'Inspect the producer or scheduled job health'], ['inspect-queue', 'Inspect queue depth and oldest-message age']]),
      unclassified: q([['inspect-resource', 'Inspect the current state of the affected resource'], ['inspect-events', 'Inspect recent events around the incident time']]),
    },
  },
  es: {
    goal: (shape, target, message) => `Diagnosticar y corregir de forma segura el incidente de ${shape} que afecta a ${target}: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `El incidente coincide con el patrón de fallo ${shape} y con la estrategia de corrección registrada ${strategyId}. El plan comienza con lecturas de diagnóstico acotadas antes de proponer los pasos de corrección de la estrategia.`,
    diagnosisRecognised: shape => `El incidente coincide con el patrón de fallo ${shape}. No coincidió ninguna estrategia de corrección registrada, por lo que el plan permanece en modo diagnóstico y no modifica el objetivo.`,
    diagnosisUnclassified: 'El incidente no coincidió con ningún patrón de fallo conocido. No coincidió ninguna estrategia de corrección, por lo que el plan recopila estado general y permanece en modo de solo lectura.',
    verifyRemediation: target => `Verificar que ${target} esté saludable después de la corrección y que no haya regresiones adyacentes`,
    verifyObservations: target => `Confirmar que las observaciones de diagnóstico de ${target} se recopilaron correctamente`,
    expectedHealthy: 'objetivo saludable y comprobaciones adyacentes correctas', expectedObserved: 'observaciones registradas',
    questions: {
      availability: q([['confirm-current-health', 'Confirmar que el recurso afectado siga no disponible'], ['inspect-dependencies', 'Inspeccionar el estado de las dependencias inmediatas'], ['inspect-recent-change', 'Inspeccionar el despliegue o cambio de configuración más reciente']]),
      deployment: q([['inspect-deployment', 'Inspeccionar el estado actual del despliegue'], ['inspect-failure-evidence', 'Inspeccionar la primera evidencia de fallo del despliegue'], ['compare-previous', 'Comparar con la revisión saludable anterior']]),
      saturation: q([['confirm-saturation', 'Confirmar que el recurso siga saturado'], ['inspect-trend', 'Inspeccionar la tendencia reciente de utilización'], ['identify-consumer', 'Identificar la carga o inquilino de mayor consumo']]),
      latency: q([['confirm-latency', 'Confirmar que la latencia siga elevada'], ['locate-slow-path', 'Localizar el endpoint u operación lenta'], ['inspect-dependencies', 'Inspeccionar la latencia de dependencias posteriores']]),
      errors: q([['confirm-error-rate', 'Confirmar que la tasa de errores siga elevada'], ['sample-errors', 'Inspeccionar fallos representativos para identificar el error dominante'], ['inspect-recent-change', 'Inspeccionar el despliegue o cambio de configuración más reciente']]),
      data_freshness: q([['confirm-freshness', 'Confirmar que los datos sigan desactualizados'], ['inspect-producer', 'Inspeccionar el estado del productor o tarea programada'], ['inspect-queue', 'Inspeccionar profundidad de cola y antigüedad del mensaje más viejo']]),
      unclassified: q([['inspect-resource', 'Inspeccionar el estado actual del recurso afectado'], ['inspect-events', 'Inspeccionar eventos recientes alrededor del incidente']]),
    },
  },
  pt: {
    goal: (shape, target, message) => `Diagnosticar e corrigir com segurança o incidente de ${shape} que afeta ${target}: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `O incidente corresponde ao padrão de falha ${shape} e à estratégia de correção registada ${strategyId}. O plano começa com leituras de diagnóstico delimitadas antes de propor os passos de correção da estratégia.`,
    diagnosisRecognised: shape => `O incidente corresponde ao padrão de falha ${shape}. Nenhuma estratégia de correção registada correspondeu, por isso o plano permanece diagnóstico e não altera o alvo.`,
    diagnosisUnclassified: 'O incidente não correspondeu a um padrão de falha conhecido. Nenhuma estratégia de correção correspondeu, por isso o plano recolhe estado geral e permanece só de leitura.',
    verifyRemediation: target => `Verificar que ${target} está saudável após a correção e que não existe regressão adjacente`,
    verifyObservations: target => `Confirmar que as observações de diagnóstico de ${target} foram recolhidas com sucesso`,
    expectedHealthy: 'alvo saudável e verificações adjacentes aprovadas', expectedObserved: 'observações registadas',
    questions: {
      availability: q([['confirm-current-health', 'Confirmar que o recurso afetado continua indisponível'], ['inspect-dependencies', 'Inspecionar a saúde das dependências imediatas'], ['inspect-recent-change', 'Inspecionar a implantação ou alteração de configuração mais recente']]),
      deployment: q([['inspect-deployment', 'Inspecionar o estado atual da implantação'], ['inspect-failure-evidence', 'Inspecionar a primeira evidência de falha da implantação'], ['compare-previous', 'Comparar com a revisão saudável anterior']]),
      saturation: q([['confirm-saturation', 'Confirmar que o recurso continua saturado'], ['inspect-trend', 'Inspecionar a tendência recente de utilização'], ['identify-consumer', 'Identificar a carga ou locatário de maior consumo']]),
      latency: q([['confirm-latency', 'Confirmar que a latência continua elevada'], ['locate-slow-path', 'Localizar o endpoint ou operação lenta'], ['inspect-dependencies', 'Inspecionar a latência das dependências a jusante']]),
      errors: q([['confirm-error-rate', 'Confirmar que a taxa de erros continua elevada'], ['sample-errors', 'Inspecionar falhas representativas para identificar o erro dominante'], ['inspect-recent-change', 'Inspecionar a implantação ou alteração de configuração mais recente']]),
      data_freshness: q([['confirm-freshness', 'Confirmar que os dados continuam desatualizados'], ['inspect-producer', 'Inspecionar a saúde do produtor ou tarefa agendada'], ['inspect-queue', 'Inspecionar profundidade da fila e idade da mensagem mais antiga']]),
      unclassified: q([['inspect-resource', 'Inspecionar o estado atual do recurso afetado'], ['inspect-events', 'Inspecionar eventos recentes em torno do incidente']]),
    },
  },
  pl: {
    goal: (shape, target, message) => `Zdiagnozuj i bezpiecznie napraw zgłoszony incydent typu ${shape} dotyczący ${target}: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `Incydent pasuje do wzorca awarii ${shape} oraz zarejestrowanej strategii naprawczej ${strategyId}. Plan zaczyna się od ograniczonych odczytów diagnostycznych przed zaproponowaniem kroków naprawczych strategii.`,
    diagnosisRecognised: shape => `Incydent pasuje do wzorca awarii ${shape}. Nie dopasowano zarejestrowanej strategii naprawczej, więc plan pozostaje diagnostyczny i nie modyfikuje celu.`,
    diagnosisUnclassified: 'Incydent nie pasuje do znanego wzorca awarii. Nie dopasowano strategii naprawczej, więc plan zbiera ogólny stan i pozostaje tylko do odczytu.',
    verifyRemediation: target => `Sprawdź, czy ${target} działa poprawnie po naprawie i czy nie wystąpiła regresja w zależnościach`,
    verifyObservations: target => `Potwierdź, że obserwacje diagnostyczne dla ${target} zostały zebrane poprawnie`,
    expectedHealthy: 'cel działa poprawnie, a kontrole zależności zakończyły się powodzeniem', expectedObserved: 'obserwacje zapisane',
    questions: {
      availability: q([['confirm-current-health', 'Potwierdź, że zasób nadal jest niedostępny'], ['inspect-dependencies', 'Sprawdź stan bezpośrednich zależności'], ['inspect-recent-change', 'Sprawdź najnowsze wdrożenie lub zmianę konfiguracji']]),
      deployment: q([['inspect-deployment', 'Sprawdź bieżący stan wdrożenia'], ['inspect-failure-evidence', 'Sprawdź pierwszą oznakę błędu wdrożenia'], ['compare-previous', 'Porównaj z poprzednią działającą wersją']]),
      saturation: q([['confirm-saturation', 'Potwierdź, że zasób nadal jest przeciążony'], ['inspect-trend', 'Sprawdź ostatni trend wykorzystania'], ['identify-consumer', 'Zidentyfikuj obciążenie lub dzierżawcę o największym zużyciu']]),
      latency: q([['confirm-latency', 'Potwierdź, że opóźnienie nadal jest podwyższone'], ['locate-slow-path', 'Zlokalizuj wolny endpoint lub operację'], ['inspect-dependencies', 'Sprawdź opóźnienie zależności podrzędnych']]),
      errors: q([['confirm-error-rate', 'Potwierdź, że współczynnik błędów nadal jest podwyższony'], ['sample-errors', 'Sprawdź reprezentatywne błędy, aby ustalić dominującą przyczynę'], ['inspect-recent-change', 'Sprawdź najnowsze wdrożenie lub zmianę konfiguracji']]),
      data_freshness: q([['confirm-freshness', 'Potwierdź, że dane nadal są nieaktualne'], ['inspect-producer', 'Sprawdź stan producenta lub zadania harmonogramu'], ['inspect-queue', 'Sprawdź głębokość kolejki i wiek najstarszej wiadomości']]),
      unclassified: q([['inspect-resource', 'Sprawdź bieżący stan zasobu'], ['inspect-events', 'Sprawdź ostatnie zdarzenia wokół czasu incydentu']]),
    },
  },
  ru: {
    goal: (shape, target, message) => `Диагностировать и безопасно устранить инцидент типа ${shape}, затрагивающий ${target}: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `Инцидент соответствует типу сбоя ${shape} и зарегистрированной стратегии восстановления ${strategyId}. План начинается с ограниченных диагностических чтений перед предложением шагов восстановления стратегии.`,
    diagnosisRecognised: shape => `Инцидент соответствует типу сбоя ${shape}. Зарегистрированная стратегия восстановления не найдена, поэтому план остаётся диагностическим и не изменяет целевой ресурс.`,
    diagnosisUnclassified: 'Инцидент не соответствует известному типу сбоя. Стратегия восстановления не найдена, поэтому план собирает общее состояние и остаётся только для чтения.',
    verifyRemediation: target => `Проверить, что ${target} исправен после восстановления и соседние компоненты не регрессировали`,
    verifyObservations: target => `Подтвердить успешный сбор диагностических наблюдений для ${target}`,
    expectedHealthy: 'целевой ресурс исправен, соседние проверки пройдены', expectedObserved: 'наблюдения записаны',
    questions: {
      availability: q([['confirm-current-health', 'Подтвердить, что ресурс всё ещё недоступен'], ['inspect-dependencies', 'Проверить состояние непосредственных зависимостей'], ['inspect-recent-change', 'Проверить последнее развёртывание или изменение конфигурации']]),
      deployment: q([['inspect-deployment', 'Проверить текущее состояние развёртывания'], ['inspect-failure-evidence', 'Проверить первый признак ошибки развёртывания'], ['compare-previous', 'Сравнить с предыдущей исправной версией']]),
      saturation: q([['confirm-saturation', 'Подтвердить, что ресурс всё ещё перегружен'], ['inspect-trend', 'Проверить недавний тренд использования'], ['identify-consumer', 'Определить нагрузку или арендатора с наибольшим потреблением']]),
      latency: q([['confirm-latency', 'Подтвердить, что задержка всё ещё повышена'], ['locate-slow-path', 'Найти медленный endpoint или операцию'], ['inspect-dependencies', 'Проверить задержку нижестоящих зависимостей']]),
      errors: q([['confirm-error-rate', 'Подтвердить, что частота ошибок всё ещё повышена'], ['sample-errors', 'Проверить типичные сбои и определить доминирующую ошибку'], ['inspect-recent-change', 'Проверить последнее развёртывание или изменение конфигурации']]),
      data_freshness: q([['confirm-freshness', 'Подтвердить, что данные всё ещё устарели'], ['inspect-producer', 'Проверить состояние производителя или запланированной задачи'], ['inspect-queue', 'Проверить глубину очереди и возраст самого старого сообщения']]),
      unclassified: q([['inspect-resource', 'Проверить текущее состояние затронутого ресурса'], ['inspect-events', 'Проверить недавние события около времени инцидента']]),
    },
  },
}

export function reasoningCopy(locale?: string | null): ReasoningCopy {
  return COPY[resolveSupervisorLocale(locale)]
}
