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
  de: {
    goal: (shape, target, message) => `Den gemeldeten ${shape}-Vorfall, der ${target} betrifft, diagnostizieren und sicher beheben: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `Der Vorfall entspricht dem Fehlermuster ${shape} und der registrierten Behebungsstrategie ${strategyId}. Der Plan beginnt mit begrenzten Diagnoseabfragen, bevor die Behebungsschritte der Strategie vorgeschlagen werden.`,
    diagnosisRecognised: shape => `Der Vorfall entspricht dem Fehlermuster ${shape}. Keine registrierte Behebungsstrategie passt, daher bleibt der Plan diagnostisch und verändert das Ziel nicht.`,
    diagnosisUnclassified: 'Der Vorfall entsprach keinem bekannten Fehlermuster. Keine Behebungsstrategie passt, daher erfasst der Plan den allgemeinen Zustand und bleibt schreibgeschützt.',
    verifyRemediation: target => `Überprüfen, dass ${target} nach der Behebung fehlerfrei läuft und keine angrenzende Regression auftritt`,
    verifyObservations: target => `Bestätigen, dass die Diagnosebeobachtungen für ${target} erfolgreich erfasst wurden`,
    expectedHealthy: 'Ziel fehlerfrei und angrenzende Prüfungen bestanden',
    expectedObserved: 'Beobachtungen erfasst',
    questions: {
      availability: q([['confirm-current-health', 'Bestätigen, dass die betroffene Ressource weiterhin nicht verfügbar ist'], ['inspect-dependencies', 'Zustand der direkten Abhängigkeiten prüfen'], ['inspect-recent-change', 'Die letzte Bereitstellung oder Konfigurationsänderung prüfen']]),
      deployment: q([['inspect-deployment', 'Den aktuellen Bereitstellungs- oder Rollout-Status prüfen'], ['inspect-failure-evidence', 'Die ersten Nachweise eines fehlschlagenden Builds oder Rollouts prüfen'], ['compare-previous', 'Mit der zuletzt fehlerfreien Revision vergleichen']]),
      saturation: q([['confirm-saturation', 'Bestätigen, dass die eingeschränkte Ressource weiterhin ausgelastet ist'], ['inspect-trend', 'Aktuellen Auslastungstrend prüfen'], ['identify-consumer', 'Die größte Workload bzw. den größten Mandanten-Verbraucher ermitteln']]),
      latency: q([['confirm-latency', 'Bestätigen, dass die gemeldete Latenz weiterhin erhöht ist'], ['locate-slow-path', 'Den langsamen Endpunkt oder Vorgang lokalisieren'], ['inspect-dependencies', 'Latenz nachgelagerter Abhängigkeiten prüfen']]),
      errors: q([['confirm-error-rate', 'Bestätigen, dass die gemeldete Fehlerrate weiterhin erhöht ist'], ['sample-errors', 'Repräsentative Fehlschläge für den vorherrschenden Fehler prüfen'], ['inspect-recent-change', 'Die letzte Bereitstellung oder Konfigurationsänderung prüfen']]),
      data_freshness: q([['confirm-freshness', 'Bestätigen, dass die Daten weiterhin veraltet sind'], ['inspect-producer', 'Zustand des Erzeugers oder geplanten Jobs prüfen'], ['inspect-queue', 'Warteschlangentiefe und Alter der ältesten Nachricht prüfen']]),
      unclassified: q([['inspect-resource', 'Aktuellen Zustand der betroffenen Ressource prüfen'], ['inspect-events', 'Aktuelle Ereignisse rund um den Vorfallszeitpunkt prüfen']]),
    },
  },
  fr: {
    goal: (shape, target, message) => `Diagnostiquer et corriger en toute sécurité l'incident ${shape} signalé affectant ${target} : ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `L'incident correspond au schéma de défaillance ${shape} et à la stratégie de correction enregistrée ${strategyId}. Le plan commence par des lectures de diagnostic limitées avant de proposer les étapes de correction de la stratégie.`,
    diagnosisRecognised: shape => `L'incident correspond au schéma de défaillance ${shape}. Aucune stratégie de correction enregistrée ne correspond ; le plan reste donc diagnostique et ne modifie pas la cible.`,
    diagnosisUnclassified: 'L\'incident ne correspond à aucun schéma de défaillance connu. Aucune stratégie de correction ne correspond ; le plan recueille donc l\'état général et reste en lecture seule.',
    verifyRemediation: target => `Vérifier que ${target} est sain après la correction et qu'aucune régression adjacente n'est observée`,
    verifyObservations: target => `Confirmer que les observations de diagnostic pour ${target} ont été recueillies avec succès`,
    expectedHealthy: 'cible saine et vérifications adjacentes réussies',
    expectedObserved: 'observations enregistrées',
    questions: {
      availability: q([['confirm-current-health', 'Confirmer que la ressource affectée est toujours indisponible'], ['inspect-dependencies', 'Inspecter la santé des dépendances immédiates'], ['inspect-recent-change', 'Inspecter le déploiement ou le changement de configuration le plus récent']]),
      deployment: q([['inspect-deployment', 'Inspecter l\'état actuel du déploiement ou du rollout'], ['inspect-failure-evidence', 'Inspecter les premières preuves d\'échec du build ou du rollout'], ['compare-previous', 'Comparer avec la dernière révision saine']]),
      saturation: q([['confirm-saturation', 'Confirmer que la ressource contrainte est toujours saturée'], ['inspect-trend', 'Inspecter la tendance d\'utilisation récente'], ['identify-consumer', 'Identifier la charge de travail ou le locataire le plus consommateur']]),
      latency: q([['confirm-latency', 'Confirmer que la latence signalée est toujours élevée'], ['locate-slow-path', 'Localiser le point de terminaison ou l\'opération lente'], ['inspect-dependencies', 'Inspecter la latence des dépendances en aval']]),
      errors: q([['confirm-error-rate', 'Confirmer que le taux d\'erreur signalé est toujours élevé'], ['sample-errors', 'Inspecter des échecs représentatifs de l\'erreur dominante'], ['inspect-recent-change', 'Inspecter le déploiement ou le changement de configuration le plus récent']]),
      data_freshness: q([['confirm-freshness', 'Confirmer que les données sont toujours obsolètes'], ['inspect-producer', 'Inspecter la santé du producteur ou de la tâche planifiée'], ['inspect-queue', 'Inspecter la profondeur de la file d\'attente et l\'âge du message le plus ancien']]),
      unclassified: q([['inspect-resource', 'Inspecter l\'état actuel de la ressource affectée'], ['inspect-events', 'Inspecter les événements récents autour de l\'heure de l\'incident']]),
    },
  },
  it: {
    goal: (shape, target, message) => `Diagnostica e correggi in sicurezza l'incidente ${shape} segnalato che interessa ${target}: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `L'incidente corrisponde al modello di guasto ${shape} e alla strategia di correzione registrata ${strategyId}. Il piano inizia con letture diagnostiche limitate prima di proporre i passaggi di correzione della strategia.`,
    diagnosisRecognised: shape => `L'incidente corrisponde al modello di guasto ${shape}. Nessuna strategia di correzione registrata corrisponde, quindi il piano resta diagnostico e non modifica la destinazione.`,
    diagnosisUnclassified: 'L\'incidente non corrisponde a nessun modello di guasto noto. Nessuna strategia di correzione corrisponde, quindi il piano raccoglie lo stato generale e resta in sola lettura.',
    verifyRemediation: target => `Verifica che ${target} sia integro dopo la correzione e che non si osservino regressioni adiacenti`,
    verifyObservations: target => `Conferma che le osservazioni diagnostiche per ${target} siano state raccolte correttamente`,
    expectedHealthy: 'destinazione integra e controlli adiacenti superati',
    expectedObserved: 'osservazioni registrate',
    questions: {
      availability: q([['confirm-current-health', 'Conferma che la risorsa interessata sia ancora non disponibile'], ['inspect-dependencies', 'Ispeziona lo stato delle dipendenze dirette'], ['inspect-recent-change', 'Ispeziona il deployment o la modifica di configurazione più recente']]),
      deployment: q([['inspect-deployment', 'Ispeziona lo stato attuale del deployment o del rollout'], ['inspect-failure-evidence', 'Ispeziona le prime prove di errore della build o del rollout'], ['compare-previous', 'Confronta con la revisione integra precedente']]),
      saturation: q([['confirm-saturation', 'Conferma che la risorsa vincolata sia ancora satura'], ['inspect-trend', 'Ispeziona l\'andamento recente dell\'utilizzo'], ['identify-consumer', 'Individua il carico di lavoro o il tenant con il consumo maggiore']]),
      latency: q([['confirm-latency', 'Conferma che la latenza segnalata sia ancora elevata'], ['locate-slow-path', 'Individua l\'endpoint o l\'operazione lenta'], ['inspect-dependencies', 'Ispeziona la latenza delle dipendenze a valle']]),
      errors: q([['confirm-error-rate', 'Conferma che il tasso di errore segnalato sia ancora elevato'], ['sample-errors', 'Ispeziona gli errori rappresentativi del problema dominante'], ['inspect-recent-change', 'Ispeziona il deployment o la modifica di configurazione più recente']]),
      data_freshness: q([['confirm-freshness', 'Conferma che i dati siano ancora obsoleti'], ['inspect-producer', 'Ispeziona lo stato del producer o del job pianificato'], ['inspect-queue', 'Ispeziona la profondità della coda e l\'età del messaggio più vecchio']]),
      unclassified: q([['inspect-resource', 'Ispeziona lo stato attuale della risorsa interessata'], ['inspect-events', 'Ispeziona gli eventi recenti intorno al momento dell\'incidente']]),
    },
  },
  ja: {
    goal: (shape, target, message) => `${target} に影響している、報告された ${shape} インシデントを診断し、安全に修復する：${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `このインシデントは障害パターン ${shape} および登録済みの修復戦略 ${strategyId} に一致します。計画は、戦略の修復ステップを提案する前に、範囲を限定した診断読み取りから開始します。`,
    diagnosisRecognised: shape => `このインシデントは障害パターン ${shape} に一致します。一致する登録済みの修復戦略がないため、計画は診断のみにとどまり、ターゲットを変更しません。`,
    diagnosisUnclassified: 'このインシデントは既知の障害パターンに一致しませんでした。一致する修復戦略がないため、計画は全般的な状態を収集し、読み取り専用のままです。',
    verifyRemediation: target => `修復後に ${target} が正常であり、隣接する機能に退行がないことを検証する`,
    verifyObservations: target => `${target} の診断観測が正常に収集されたことを確認する`,
    expectedHealthy: 'ターゲットが正常で、隣接チェックに合格',
    expectedObserved: '観測を記録済み',
    questions: {
      availability: q([['confirm-current-health', '影響を受けたリソースが引き続き利用できないことを確認する'], ['inspect-dependencies', '直接の依存関係の健全性を確認する'], ['inspect-recent-change', '直近のデプロイまたは設定変更を確認する']]),
      deployment: q([['inspect-deployment', '現在のデプロイまたはロールアウトの状態を確認する'], ['inspect-failure-evidence', '最初に失敗したビルドまたはロールアウトの証拠を確認する'], ['compare-previous', '以前の正常なリビジョンと比較する']]),
      saturation: q([['confirm-saturation', '制約されたリソースが引き続き飽和状態であることを確認する'], ['inspect-trend', '最近の使用率の傾向を確認する'], ['identify-consumer', '最大のワークロードまたはテナントの消費元を特定する']]),
      latency: q([['confirm-latency', '報告されたレイテンシが引き続き高いことを確認する'], ['locate-slow-path', '遅いエンドポイントまたは操作を特定する'], ['inspect-dependencies', '下流の依存関係のレイテンシを確認する']]),
      errors: q([['confirm-error-rate', '報告されたエラー率が引き続き高いことを確認する'], ['sample-errors', '主要なエラーの代表的な失敗例を確認する'], ['inspect-recent-change', '直近のデプロイまたは設定変更を確認する']]),
      data_freshness: q([['confirm-freshness', 'データが引き続き古いことを確認する'], ['inspect-producer', 'プロデューサーまたはスケジュールされたジョブの健全性を確認する'], ['inspect-queue', 'キューの深さと最も古いメッセージの経過時間を確認する']]),
      unclassified: q([['inspect-resource', '影響を受けたリソースの現在の状態を確認する'], ['inspect-events', 'インシデント発生時刻前後の最近のイベントを確認する']]),
    },
  },
  ko: {
    goal: (shape, target, message) => `${target}에 영향을 주는 보고된 ${shape} 인시던트를 진단하고 안전하게 해결: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `이 인시던트는 ${shape} 장애 유형 및 등록된 해결 전략 ${strategyId}과 일치합니다. 계획은 전략의 해결 단계를 제안하기 전에 제한된 진단 읽기부터 시작합니다.`,
    diagnosisRecognised: shape => `이 인시던트는 ${shape} 장애 유형과 일치합니다. 일치하는 등록된 해결 전략이 없으므로 계획은 진단 단계에 머물며 대상을 변경하지 않습니다.`,
    diagnosisUnclassified: '이 인시던트는 알려진 장애 유형과 일치하지 않았습니다. 일치하는 해결 전략이 없으므로 계획은 일반 상태를 수집하고 읽기 전용으로 유지됩니다.',
    verifyRemediation: target => `해결 후 ${target}이(가) 정상이며 인접한 회귀가 관찰되지 않는지 확인`,
    verifyObservations: target => `${target}에 대한 진단 관찰이 성공적으로 수집되었는지 확인`,
    expectedHealthy: '대상 정상 및 인접 검사 통과',
    expectedObserved: '관찰 기록됨',
    questions: {
      availability: q([['confirm-current-health', '영향을 받은 리소스가 여전히 사용 불가 상태인지 확인'], ['inspect-dependencies', '직접 종속성 상태 검사'], ['inspect-recent-change', '가장 최근의 배포 또는 구성 변경 검사']]),
      deployment: q([['inspect-deployment', '현재 배포 또는 롤아웃 상태 검사'], ['inspect-failure-evidence', '처음 실패한 빌드 또는 롤아웃 증거 검사'], ['compare-previous', '이전의 정상 리비전과 비교']]),
      saturation: q([['confirm-saturation', '제약된 리소스가 여전히 포화 상태인지 확인'], ['inspect-trend', '최근 사용률 추세 검사'], ['identify-consumer', '가장 큰 워크로드 또는 테넌트 소비자 식별']]),
      latency: q([['confirm-latency', '보고된 지연 시간이 여전히 높은지 확인'], ['locate-slow-path', '느린 엔드포인트 또는 작업 찾기'], ['inspect-dependencies', '다운스트림 종속성 지연 시간 검사']]),
      errors: q([['confirm-error-rate', '보고된 오류율이 여전히 높은지 확인'], ['sample-errors', '주요 오류의 대표적인 실패 사례 검사'], ['inspect-recent-change', '가장 최근의 배포 또는 구성 변경 검사']]),
      data_freshness: q([['confirm-freshness', '데이터가 여전히 오래된 상태인지 확인'], ['inspect-producer', '생산자 또는 예약된 작업 상태 검사'], ['inspect-queue', '대기열 깊이와 가장 오래된 메시지의 경과 시간 검사']]),
      unclassified: q([['inspect-resource', '영향을 받은 리소스의 현재 상태 검사'], ['inspect-events', '인시던트 발생 시점 전후의 최근 이벤트 검사']]),
    },
  },
  ar: {
    goal: (shape, target, message) => `تشخيص حادث ${shape} المُبلّغ عنه والذي يؤثر في ${target} ومعالجته بأمان: ${message}`,
    diagnosisWithStrategy: (shape, strategyId) => `يطابق الحادث نمط الفشل ${shape} واستراتيجية المعالجة المسجّلة ${strategyId}. تبدأ الخطة بقراءات تشخيصية محدودة قبل اقتراح خطوات المعالجة الخاصة بالاستراتيجية.`,
    diagnosisRecognised: shape => `يطابق الحادث نمط الفشل ${shape}. لم تتطابق أي استراتيجية معالجة مسجّلة، لذا تظل الخطة تشخيصية ولا تُعدّل الهدف.`,
    diagnosisUnclassified: 'لم يطابق الحادث أي نمط فشل معروف. لم تتطابق أي استراتيجية معالجة، لذا تجمع الخطة الحالة العامة وتظل للقراءة فقط.',
    verifyRemediation: target => `التحقق من سلامة ${target} بعد المعالجة وعدم ملاحظة أي تراجع في المكونات المجاورة`,
    verifyObservations: target => `التأكد من جمع الملاحظات التشخيصية لـ ${target} بنجاح`,
    expectedHealthy: 'الهدف سليم والفحوصات المجاورة ناجحة',
    expectedObserved: 'تم تسجيل الملاحظات',
    questions: {
      availability: q([['confirm-current-health', 'التأكد من أن المورد المتأثر لا يزال غير متاح'], ['inspect-dependencies', 'فحص سلامة التبعيات المباشرة'], ['inspect-recent-change', 'فحص أحدث عملية نشر أو تغيير في التكوين']]),
      deployment: q([['inspect-deployment', 'فحص الحالة الحالية للنشر أو الطرح'], ['inspect-failure-evidence', 'فحص أول دليل على فشل البناء أو الطرح'], ['compare-previous', 'المقارنة مع المراجعة السليمة السابقة']]),
      saturation: q([['confirm-saturation', 'التأكد من أن المورد المقيّد لا يزال مُشبعًا'], ['inspect-trend', 'فحص اتجاه الاستخدام الأخير'], ['identify-consumer', 'تحديد أكبر حمل عمل أو مستأجر مستهلك']]),
      latency: q([['confirm-latency', 'التأكد من أن زمن الاستجابة المُبلّغ عنه لا يزال مرتفعًا'], ['locate-slow-path', 'تحديد موقع نقطة النهاية أو العملية البطيئة'], ['inspect-dependencies', 'فحص زمن استجابة التبعيات اللاحقة']]),
      errors: q([['confirm-error-rate', 'التأكد من أن معدل الأخطاء المُبلّغ عنه لا يزال مرتفعًا'], ['sample-errors', 'فحص حالات فشل تمثيلية للخطأ السائد'], ['inspect-recent-change', 'فحص أحدث عملية نشر أو تغيير في التكوين']]),
      data_freshness: q([['confirm-freshness', 'التأكد من أن البيانات لا تزال قديمة'], ['inspect-producer', 'فحص سلامة المُنتِج أو المهمة المجدولة'], ['inspect-queue', 'فحص عمق قائمة الانتظار وعمر أقدم رسالة']]),
      unclassified: q([['inspect-resource', 'فحص الحالة الحالية للمورد المتأثر'], ['inspect-events', 'فحص الأحداث الأخيرة حول وقت وقوع الحادث']]),
    },
  },
}

export function reasoningCopy(locale?: string | null): ReasoningCopy {
  return COPY[resolveSupervisorLocale(locale)]
}
