// saas/lib/supervisor/portable/observation-copy.ts
//
// PLAN AND EVIDENCE TEXT IN FIVE LANGUAGES.
//
// The approval email was the loudest English string in this product, but not the only one.
// Every plan step description, every expected result, every stop reason and every evidence
// summary was written in English inside the thinker and the health intelligence — and all of
// them are read by people: the operator opening the console, the reviewer reading an audit
// record, the engineer deciding whether a diagnosis was sound.
//
// A product offered in five languages is offered in five languages. Not the interface in five
// and the substance in one.
//
// WHY THE TEXT IS TRANSLATED WHEN IT IS WRITTEN, not when it is displayed: an evidence record
// is a historical statement about what was observed at a moment in time. It keeps the language
// it was recorded in, and flipping a configuration setting later does not rewrite history. The
// machine-readable parts — step ids, event types, incident types — are unaffected by locale in
// either direction, so a SIEM rule or a report built on them is stable no matter what any
// human reads.
//
// PLACEHOLDERS are named ({count}, {id}, {state}) rather than positional, because a translator
// reordering a sentence must not have to preserve argument order to keep it correct.
//
// NO DEPENDENCIES. The payload's zero-dependency guarantee is a selling point.

import type { SupervisorLocale } from './notification-copy.ts'
import { resolveSupervisorLocale } from './notification-copy.ts'

export interface ObservationCopy {
  steps: {
    readDeployment: string
    readDeploymentExpected: string
    readEvents: string
    readEventsExpected: string
    readEnvNames: string
    readEnvNamesExpected: string
    readAliases: string
    readAliasesExpected: string
    readConnection: string
    verifyDiagnosis: string
    stopExpected: string
  }
  stops: {
    missingDeploymentId: string
    missingRepeatedIds: string
    unknownState: string
    unsupportedShape: string
    unsupportedProvider: string
    retryAfterBackoff: string
    rejectedByPolicy: string
  }
  diagnoses: {
    deploymentFailed: string
    repeatedFailure: string
    stuckDeployment: string
    canceledProduction: string
    unknownState: string
    apiUnavailable: string
    authFailed: string
    unsupported: string
  }
  verification: {
    readFailed: string
    rejected: string
    failedWithReasons: string
    verifyReadOnly: string
  }
  evidence: {
    deploymentState: string
    eventsRead: string
    envNamesRead: string
    aliasesRead: string
    noIncident: string
    healthyVerified: string
    incidentVerified: string
  }
}

const COPY: Record<SupervisorLocale, ObservationCopy> = {
  en: {
    steps: {
      readDeployment: 'Read the selected failed Vercel deployment details before diagnosing.',
      readDeploymentExpected: 'Deployment state, target, commit metadata, and sanitized error summary are available.',
      readEvents: 'Read deployment events and build/runtime logs for the selected deployment.',
      readEventsExpected: 'Sanitized build events/log summaries are available without secret values.',
      readEnvNames: 'Inspect configured environment variable names for the project and target only; do not read secret values.',
      readEnvNamesExpected: 'Only variable names/targets are compared; plaintext values are never requested.',
      readAliases: 'Inspect production aliases to determine whether the canceled deployment affected the live alias.',
      readAliasesExpected: 'Alias pointers are available for review without modifying production.',
      readConnection: 'Inspect Vercel connection metadata and required secret references without exposing or rotating secret values.',
      verifyDiagnosis: 'Verify that the diagnosis was based on the selected deployment, events/logs, and any required alias/env-name reads.',
      stopExpected: 'No execution is attempted for unsupported or ambiguous cases.',
    },
    stops: {
      missingDeploymentId: 'Deployment incident did not include a deployment ID; human review is required.',
      missingRepeatedIds: 'Repeated deployment failure did not include deploymentIds; human review is required.',
      unknownState: 'Unknown Vercel state requires human/provider review after read-only evidence collection.',
      unsupportedShape: 'Unsupported Vercel incident shape. Fail closed and request human review.',
      unsupportedProvider: 'Unsupported provider or Vercel incident type.',
      retryAfterBackoff: 'Retry read-only Vercel status/deployment reads after the bounded observer backoff window.',
      rejectedByPolicy: 'Ownership, policy, or scope validation rejected the run.',
    },
    diagnoses: {
      deploymentFailed: 'A deployment failed. Diagnose from the latest failed deployment, its events, and sanitized logs before proposing any repair.',
      repeatedFailure: 'Multiple recent deployments failed consecutively. Compare the failed deployments and logs to identify a shared root cause.',
      stuckDeployment: 'A deployment appears stuck beyond the configured threshold. Confirm current provider state and events before any intervention.',
      canceledProduction: 'A production deployment was canceled. Inspect production aliases to determine whether live traffic is affected before any recovery action.',
      unknownState: 'The provider returned an unknown deployment state. Fail closed and gather read-only details for human review.',
      apiUnavailable: 'Provider read APIs are unavailable or rate-limited. Do not infer an application repair until provider reads recover.',
      authFailed: 'The observer cannot authenticate. Treat this as provider connection configuration work requiring protected approval.',
      unsupported: 'Unsupported incident shape. Fail closed and request human review.',
    },
    verification: {
      readFailed: 'A required read-only evidence read failed.',
      rejected: 'Ownership, policy, or scope validation rejected the run.',
      failedWithReasons: 'Verification failed: {reasons}',
      verifyReadOnly: 'Verification uses read-only observations only.',
    },
    evidence: {
      deploymentState: 'Deployment {id} state is {state}.',
      eventsRead: 'Read {count} deployment events/log entries for {id}.',
      envNamesRead: 'Read {count} environment variable names; values were not requested.',
      aliasesRead: 'Read {count} production aliases.',
      noIncident: 'No deployment incident was detected by read-only observation.',
      healthyVerified: 'Healthy result verified because observation completed and found no incidents.',
      incidentVerified: 'Incident health intelligence verified with exact read-only deployment evidence, identity binding, and no mutation or browser execution.',
    },
  },
  es: {
    steps: {
      readDeployment: 'Leer los detalles del despliegue fallido seleccionado antes de diagnosticar.',
      readDeploymentExpected: 'El estado, el destino, los metadatos del commit y un resumen saneado del error están disponibles.',
      readEvents: 'Leer los eventos del despliegue y los registros de compilación y ejecución del despliegue seleccionado.',
      readEventsExpected: 'Los resúmenes saneados de eventos y registros están disponibles sin valores secretos.',
      readEnvNames: 'Inspeccionar solo los nombres de las variables de entorno configuradas para el proyecto y el destino; no leer valores secretos.',
      readEnvNamesExpected: 'Solo se comparan nombres y destinos; nunca se solicitan valores en texto plano.',
      readAliases: 'Inspeccionar los alias de producción para determinar si el despliegue cancelado afectó al alias activo.',
      readAliasesExpected: 'Los alias pueden revisarse sin modificar producción.',
      readConnection: 'Inspeccionar los metadatos de conexión y las referencias de secretos necesarias sin exponer ni rotar valores secretos.',
      verifyDiagnosis: 'Verificar que el diagnóstico se basó en el despliegue seleccionado, en los eventos y registros, y en las lecturas de alias o nombres de variables requeridas.',
      stopExpected: 'No se intenta ninguna ejecución en casos no admitidos o ambiguos.',
    },
    stops: {
      missingDeploymentId: 'El incidente no incluyó un identificador de despliegue; se requiere revisión humana.',
      missingRepeatedIds: 'El fallo repetido no incluyó identificadores de despliegue; se requiere revisión humana.',
      unknownState: 'Un estado desconocido requiere revisión humana o del proveedor tras recopilar evidencia de solo lectura.',
      unsupportedShape: 'Forma de incidente no admitida. Se falla de forma cerrada y se solicita revisión humana.',
      unsupportedProvider: 'Proveedor o tipo de incidente no admitido.',
      retryAfterBackoff: 'Reintentar las lecturas de solo lectura tras la ventana de espera acotada del observador.',
      rejectedByPolicy: 'La validación de propiedad, política o alcance rechazó la ejecución.',
    },
    diagnoses: {
      deploymentFailed: 'Un despliegue falló. Diagnostique a partir del último despliegue fallido, sus eventos y los registros saneados antes de proponer cualquier reparación.',
      repeatedFailure: 'Varios despliegues recientes fallaron consecutivamente. Compare los despliegues fallidos y los registros para identificar una causa raíz común.',
      stuckDeployment: 'Un despliegue parece bloqueado más allá del umbral configurado. Confirme el estado actual del proveedor y los eventos antes de intervenir.',
      canceledProduction: 'Se canceló un despliegue de producción. Inspeccione los alias de producción para determinar si el tráfico activo está afectado antes de cualquier recuperación.',
      unknownState: 'El proveedor devolvió un estado de despliegue desconocido. Falle de forma cerrada y recopile detalles de solo lectura para revisión humana.',
      apiUnavailable: 'Las API de lectura del proveedor no están disponibles o están limitadas. No infiera una reparación hasta que se recuperen las lecturas.',
      authFailed: 'El observador no puede autenticarse. Trátelo como configuración de la conexión del proveedor, que requiere aprobación protegida.',
      unsupported: 'Forma de incidente no admitida. Falle de forma cerrada y solicite revisión humana.',
    },
    verification: {
      readFailed: 'Falló una lectura de evidencia de solo lectura requerida.',
      rejected: 'La validación de propiedad, política o alcance rechazó la ejecución.',
      failedWithReasons: 'La verificación falló: {reasons}',
      verifyReadOnly: 'La verificación usa únicamente observaciones de solo lectura.',
    },
    evidence: {
      deploymentState: 'El estado del despliegue {id} es {state}.',
      eventsRead: 'Se leyeron {count} eventos o entradas de registro del despliegue {id}.',
      envNamesRead: 'Se leyeron {count} nombres de variables de entorno; no se solicitaron los valores.',
      aliasesRead: 'Se leyeron {count} alias de producción.',
      noIncident: 'La observación de solo lectura no detectó ningún incidente de despliegue.',
      healthyVerified: 'Resultado saludable verificado porque la observación se completó y no encontró incidentes.',
      incidentVerified: 'Inteligencia de estado del incidente verificada con evidencia exacta de solo lectura, vinculación de identidad y sin mutaciones ni ejecución de navegador.',
    },
  },
  pt: {
    steps: {
      readDeployment: 'Ler os detalhes da implantação falhada selecionada antes de diagnosticar.',
      readDeploymentExpected: 'O estado, o destino, os metadados do commit e um resumo sanitizado do erro estão disponíveis.',
      readEvents: 'Ler os eventos da implantação e os registos de compilação e execução da implantação selecionada.',
      readEventsExpected: 'Os resumos sanitizados de eventos e registos estão disponíveis sem valores secretos.',
      readEnvNames: 'Inspecionar apenas os nomes das variáveis de ambiente configuradas para o projeto e o destino; não ler valores secretos.',
      readEnvNamesExpected: 'Apenas nomes e destinos são comparados; valores em texto simples nunca são solicitados.',
      readAliases: 'Inspecionar os aliases de produção para determinar se a implantação cancelada afetou o alias ativo.',
      readAliasesExpected: 'Os aliases podem ser revistos sem alterar produção.',
      readConnection: 'Inspecionar os metadados de ligação e as referências de segredos necessárias sem expor nem rodar valores secretos.',
      verifyDiagnosis: 'Verificar que o diagnóstico se baseou na implantação selecionada, nos eventos e registos, e nas leituras de alias ou nomes de variáveis necessárias.',
      stopExpected: 'Nenhuma execução é tentada em casos não suportados ou ambíguos.',
    },
    stops: {
      missingDeploymentId: 'O incidente não incluiu um identificador de implantação; é necessária revisão humana.',
      missingRepeatedIds: 'A falha repetida não incluiu identificadores de implantação; é necessária revisão humana.',
      unknownState: 'Um estado desconhecido exige revisão humana ou do fornecedor após a recolha de evidência só de leitura.',
      unsupportedShape: 'Forma de incidente não suportada. Falha de forma fechada e pede revisão humana.',
      unsupportedProvider: 'Fornecedor ou tipo de incidente não suportado.',
      retryAfterBackoff: 'Repetir as leituras só de leitura após a janela de espera limitada do observador.',
      rejectedByPolicy: 'A validação de propriedade, política ou âmbito rejeitou a execução.',
    },
    diagnoses: {
      deploymentFailed: 'Uma implantação falhou. Diagnostique a partir da última implantação falhada, dos seus eventos e dos registos sanitizados antes de propor qualquer reparação.',
      repeatedFailure: 'Várias implantações recentes falharam consecutivamente. Compare as implantações falhadas e os registos para identificar uma causa raiz comum.',
      stuckDeployment: 'Uma implantação parece bloqueada além do limite configurado. Confirme o estado atual do fornecedor e os eventos antes de intervir.',
      canceledProduction: 'Uma implantação de produção foi cancelada. Inspecione os aliases de produção para determinar se o tráfego ativo é afetado antes de qualquer recuperação.',
      unknownState: 'O fornecedor devolveu um estado de implantação desconhecido. Falhe de forma fechada e recolha detalhes só de leitura para revisão humana.',
      apiUnavailable: 'As APIs de leitura do fornecedor estão indisponíveis ou limitadas. Não infira uma reparação até as leituras recuperarem.',
      authFailed: 'O observador não consegue autenticar-se. Trate isto como configuração da ligação ao fornecedor, exigindo aprovação protegida.',
      unsupported: 'Forma de incidente não suportada. Falhe de forma fechada e peça revisão humana.',
    },
    verification: {
      readFailed: 'Falhou uma leitura de evidência só de leitura necessária.',
      rejected: 'A validação de propriedade, política ou âmbito rejeitou a execução.',
      failedWithReasons: 'A verificação falhou: {reasons}',
      verifyReadOnly: 'A verificação usa apenas observações só de leitura.',
    },
    evidence: {
      deploymentState: 'O estado da implantação {id} é {state}.',
      eventsRead: 'Foram lidos {count} eventos ou entradas de registo da implantação {id}.',
      envNamesRead: 'Foram lidos {count} nomes de variáveis de ambiente; os valores não foram solicitados.',
      aliasesRead: 'Foram lidos {count} aliases de produção.',
      noIncident: 'A observação só de leitura não detetou qualquer incidente de implantação.',
      healthyVerified: 'Resultado saudável verificado porque a observação foi concluída e não encontrou incidentes.',
      incidentVerified: 'Inteligência de estado do incidente verificada com evidência exata só de leitura, vinculação de identidade e sem mutação nem execução de navegador.',
    },
  },
  pl: {
    steps: {
      readDeployment: 'Odczytaj szczegóły wybranego nieudanego wdrożenia przed postawieniem diagnozy.',
      readDeploymentExpected: 'Dostępny jest stan, środowisko docelowe, metadane commitu i oczyszczone podsumowanie błędu.',
      readEvents: 'Odczytaj zdarzenia wdrożenia oraz logi kompilacji i działania dla wybranego wdrożenia.',
      readEventsExpected: 'Oczyszczone podsumowania zdarzeń i logów są dostępne bez wartości sekretów.',
      readEnvNames: 'Sprawdź wyłącznie nazwy skonfigurowanych zmiennych środowiskowych projektu i środowiska docelowego; nie odczytuj wartości sekretów.',
      readEnvNamesExpected: 'Porównywane są wyłącznie nazwy i środowiska; wartości jawne nigdy nie są pobierane.',
      readAliases: 'Sprawdź aliasy produkcyjne, aby ustalić, czy anulowane wdrożenie wpłynęło na alias aktywny.',
      readAliasesExpected: 'Aliasy można przejrzeć bez modyfikowania produkcji.',
      readConnection: 'Sprawdź metadane połączenia i wymagane odwołania do sekretów bez ujawniania ani rotowania wartości sekretów.',
      verifyDiagnosis: 'Zweryfikuj, że diagnoza opierała się na wybranym wdrożeniu, zdarzeniach i logach oraz na wymaganych odczytach aliasów lub nazw zmiennych.',
      stopExpected: 'W przypadkach nieobsługiwanych lub niejednoznacznych nie podejmuje się żadnego wykonania.',
    },
    stops: {
      missingDeploymentId: 'Incydent nie zawierał identyfikatora wdrożenia; wymagana jest weryfikacja przez człowieka.',
      missingRepeatedIds: 'Powtarzająca się awaria nie zawierała identyfikatorów wdrożeń; wymagana jest weryfikacja przez człowieka.',
      unknownState: 'Nieznany stan wymaga weryfikacji przez człowieka lub dostawcę po zebraniu dowodów tylko do odczytu.',
      unsupportedShape: 'Nieobsługiwana postać incydentu. Następuje bezpieczne zatrzymanie i prośba o weryfikację przez człowieka.',
      unsupportedProvider: 'Nieobsługiwany dostawca lub typ incydentu.',
      retryAfterBackoff: 'Ponów odczyty tylko do odczytu po ograniczonym oknie oczekiwania obserwatora.',
      rejectedByPolicy: 'Walidacja własności, polityki lub zakresu odrzuciła przebieg.',
    },
    diagnoses: {
      deploymentFailed: 'Wdrożenie nie powiodło się. Postaw diagnozę na podstawie ostatniego nieudanego wdrożenia, jego zdarzeń i oczyszczonych logów, zanim zaproponujesz naprawę.',
      repeatedFailure: 'Kilka ostatnich wdrożeń nie powiodło się po kolei. Porównaj nieudane wdrożenia i logi, aby znaleźć wspólną przyczynę źródłową.',
      stuckDeployment: 'Wdrożenie wydaje się zablokowane poza skonfigurowanym progiem. Potwierdź bieżący stan dostawcy i zdarzenia przed jakąkolwiek interwencją.',
      canceledProduction: 'Wdrożenie produkcyjne zostało anulowane. Sprawdź aliasy produkcyjne, aby ustalić, czy ruch produkcyjny jest dotknięty, zanim podejmiesz działania naprawcze.',
      unknownState: 'Dostawca zwrócił nieznany stan wdrożenia. Zatrzymaj się bezpiecznie i zbierz dane tylko do odczytu do weryfikacji przez człowieka.',
      apiUnavailable: 'API odczytu dostawcy są niedostępne lub ograniczone. Nie wnioskuj o naprawie, dopóki odczyty nie wrócą.',
      authFailed: 'Obserwator nie może się uwierzytelnić. Potraktuj to jako konfigurację połączenia z dostawcą, wymagającą chronionego zatwierdzenia.',
      unsupported: 'Nieobsługiwana postać incydentu. Zatrzymaj się bezpiecznie i poproś o weryfikację przez człowieka.',
    },
    verification: {
      readFailed: 'Wymagany odczyt dowodów tylko do odczytu nie powiódł się.',
      rejected: 'Walidacja własności, polityki lub zakresu odrzuciła przebieg.',
      failedWithReasons: 'Weryfikacja nie powiodła się: {reasons}',
      verifyReadOnly: 'Weryfikacja opiera się wyłącznie na obserwacjach tylko do odczytu.',
    },
    evidence: {
      deploymentState: 'Stan wdrożenia {id} to {state}.',
      eventsRead: 'Odczytano {count} zdarzeń lub wpisów logu dla wdrożenia {id}.',
      envNamesRead: 'Odczytano {count} nazw zmiennych środowiskowych; wartości nie były pobierane.',
      aliasesRead: 'Odczytano {count} aliasów produkcyjnych.',
      noIncident: 'Obserwacja tylko do odczytu nie wykryła żadnego incydentu wdrożenia.',
      healthyVerified: 'Wynik prawidłowy zweryfikowany, ponieważ obserwacja zakończyła się i nie znalazła incydentów.',
      incidentVerified: 'Analiza stanu incydentu zweryfikowana na podstawie dokładnych dowodów tylko do odczytu, powiązania tożsamości oraz braku modyfikacji i wykonania w przeglądarce.',
    },
  },
  ru: {
    steps: {
      readDeployment: 'Прочитать сведения о выбранном неудавшемся развёртывании до постановки диагноза.',
      readDeploymentExpected: 'Доступны состояние, целевая среда, метаданные коммита и очищенная сводка ошибки.',
      readEvents: 'Прочитать события развёртывания и журналы сборки и выполнения для выбранного развёртывания.',
      readEventsExpected: 'Очищенные сводки событий и журналов доступны без значений секретов.',
      readEnvNames: 'Проверить только имена настроенных переменных окружения проекта и целевой среды; значения секретов не читать.',
      readEnvNamesExpected: 'Сравниваются только имена и целевые среды; открытые значения никогда не запрашиваются.',
      readAliases: 'Проверить продакшен-алиасы, чтобы определить, затронуло ли отменённое развёртывание активный алиас.',
      readAliasesExpected: 'Алиасы можно просмотреть, не изменяя продакшен.',
      readConnection: 'Проверить метаданные подключения и необходимые ссылки на секреты, не раскрывая и не меняя значения секретов.',
      verifyDiagnosis: 'Убедиться, что диагноз основан на выбранном развёртывании, событиях и журналах, а также на требуемых чтениях алиасов или имён переменных.',
      stopExpected: 'В неподдерживаемых или неоднозначных случаях выполнение не предпринимается.',
    },
    stops: {
      missingDeploymentId: 'Инцидент не содержал идентификатора развёртывания; требуется проверка человеком.',
      missingRepeatedIds: 'Повторный сбой не содержал идентификаторов развёртываний; требуется проверка человеком.',
      unknownState: 'Неизвестное состояние требует проверки человеком или поставщиком после сбора данных только для чтения.',
      unsupportedShape: 'Неподдерживаемая форма инцидента. Безопасная остановка и запрос проверки человеком.',
      unsupportedProvider: 'Неподдерживаемый поставщик или тип инцидента.',
      retryAfterBackoff: 'Повторить чтение только для чтения после ограниченного окна ожидания наблюдателя.',
      rejectedByPolicy: 'Проверка владения, политики или области действия отклонила запуск.',
    },
    diagnoses: {
      deploymentFailed: 'Развёртывание завершилось неудачей. Поставьте диагноз по последнему неудавшемуся развёртыванию, его событиям и очищенным журналам, прежде чем предлагать восстановление.',
      repeatedFailure: 'Несколько последних развёртываний подряд завершились неудачей. Сравните их и журналы, чтобы найти общую первопричину.',
      stuckDeployment: 'Развёртывание выглядит зависшим сверх заданного порога. Подтвердите текущее состояние у поставщика и события до любого вмешательства.',
      canceledProduction: 'Продакшен-развёртывание было отменено. Проверьте продакшен-алиасы, чтобы определить, затронут ли рабочий трафик, до любых действий по восстановлению.',
      unknownState: 'Поставщик вернул неизвестное состояние развёртывания. Безопасно остановитесь и соберите данные только для чтения для проверки человеком.',
      apiUnavailable: 'API чтения поставщика недоступны или ограничены. Не делайте выводов о восстановлении, пока чтение не восстановится.',
      authFailed: 'Наблюдатель не может пройти аутентификацию. Считайте это настройкой подключения поставщика, требующей защищённого согласования.',
      unsupported: 'Неподдерживаемая форма инцидента. Безопасная остановка и запрос проверки человеком.',
    },
    verification: {
      readFailed: 'Требуемое чтение данных только для чтения не удалось.',
      rejected: 'Проверка владения, политики или области действия отклонила запуск.',
      failedWithReasons: 'Проверка не пройдена: {reasons}',
      verifyReadOnly: 'Проверка использует только наблюдения в режиме чтения.',
    },
    evidence: {
      deploymentState: 'Состояние развёртывания {id} — {state}.',
      eventsRead: 'Прочитано {count} событий или записей журнала для развёртывания {id}.',
      envNamesRead: 'Прочитано {count} имён переменных окружения; значения не запрашивались.',
      aliasesRead: 'Прочитано {count} продакшен-алиасов.',
      noIncident: 'Наблюдение только для чтения не обнаружило инцидентов развёртывания.',
      healthyVerified: 'Исправное состояние подтверждено: наблюдение завершилось и инцидентов не найдено.',
      incidentVerified: 'Аналитика состояния инцидента подтверждена точными данными только для чтения, привязкой идентичности и отсутствием изменений и запусков браузера.',
    },
  },
  de: {
    steps: {
      readDeployment: 'Lesen Sie vor der Diagnose die Details der ausgewählten fehlgeschlagenen Vercel-Bereitstellung.',
      readDeploymentExpected: 'Bereitstellungsstatus, Ziel, Commit-Metadaten und eine bereinigte Fehlerzusammenfassung sind verfügbar.',
      readEvents: 'Lesen Sie die Bereitstellungsereignisse sowie Build- und Laufzeitprotokolle der ausgewählten Bereitstellung.',
      readEventsExpected: 'Bereinigte Build-Ereignisse/Protokollzusammenfassungen sind ohne geheime Werte verfügbar.',
      readEnvNames: 'Prüfen Sie nur die konfigurierten Namen der Umgebungsvariablen für Projekt und Ziel; lesen Sie keine geheimen Werte.',
      readEnvNamesExpected: 'Es werden nur Variablennamen/Ziele verglichen; Klartextwerte werden nie angefordert.',
      readAliases: 'Prüfen Sie die Produktions-Aliase, um festzustellen, ob die abgebrochene Bereitstellung den Live-Alias beeinträchtigt hat.',
      readAliasesExpected: 'Alias-Verweise stehen zur Prüfung bereit, ohne die Produktion zu verändern.',
      readConnection: 'Prüfen Sie die Vercel-Verbindungsmetadaten und die erforderlichen Secret-Referenzen, ohne geheime Werte offenzulegen oder zu rotieren.',
      verifyDiagnosis: 'Überprüfen Sie, dass die Diagnose auf der ausgewählten Bereitstellung, den Ereignissen/Protokollen und allen erforderlichen Alias-/Umgebungsnamen-Lesevorgängen beruhte.',
      stopExpected: 'Bei nicht unterstützten oder mehrdeutigen Fällen wird keine Ausführung versucht.',
    },
    stops: {
      missingDeploymentId: 'Der Bereitstellungsvorfall enthielt keine Bereitstellungs-ID; eine manuelle Prüfung ist erforderlich.',
      missingRepeatedIds: 'Der wiederholte Bereitstellungsfehler enthielt keine deploymentIds; eine manuelle Prüfung ist erforderlich.',
      unknownState: 'Ein unbekannter Vercel-Status erfordert nach der schreibgeschützten Beweiserhebung eine Prüfung durch Menschen oder den Anbieter.',
      unsupportedShape: 'Nicht unterstützte Form des Vercel-Vorfalls. Sicher abbrechen und eine manuelle Prüfung anfordern.',
      unsupportedProvider: 'Nicht unterstützter Anbieter oder Vercel-Vorfallstyp.',
      retryAfterBackoff: 'Wiederholen Sie die schreibgeschützten Vercel-Status-/Bereitstellungsabfragen nach dem begrenzten Backoff-Fenster des Beobachters.',
      rejectedByPolicy: 'Die Validierung von Eigentümerschaft, Richtlinie oder Geltungsbereich hat den Lauf abgelehnt.',
    },
    diagnoses: {
      deploymentFailed: 'Eine Bereitstellung ist fehlgeschlagen. Diagnostizieren Sie anhand der letzten fehlgeschlagenen Bereitstellung, ihrer Ereignisse und bereinigten Protokolle, bevor Sie eine Reparatur vorschlagen.',
      repeatedFailure: 'Mehrere aktuelle Bereitstellungen sind nacheinander fehlgeschlagen. Vergleichen Sie die fehlgeschlagenen Bereitstellungen und Protokolle, um eine gemeinsame Grundursache zu ermitteln.',
      stuckDeployment: 'Eine Bereitstellung scheint über den konfigurierten Schwellenwert hinaus zu hängen. Bestätigen Sie vor jedem Eingriff den aktuellen Anbieterstatus und die Ereignisse.',
      canceledProduction: 'Eine Produktionsbereitstellung wurde abgebrochen. Prüfen Sie die Produktions-Aliase, um festzustellen, ob Live-Traffic betroffen ist, bevor Sie eine Wiederherstellungsmaßnahme ergreifen.',
      unknownState: 'Der Anbieter hat einen unbekannten Bereitstellungsstatus zurückgegeben. Sicher abbrechen und schreibgeschützte Details für eine manuelle Prüfung sammeln.',
      apiUnavailable: 'Die Lese-APIs des Anbieters sind nicht verfügbar oder ratenbegrenzt. Leiten Sie keine Anwendungsreparatur ab, bis die Anbieterabfragen wieder funktionieren.',
      authFailed: 'Der Beobachter kann sich nicht authentifizieren. Behandeln Sie dies als Konfigurationsarbeit an der Anbieterverbindung, die eine geschützte Genehmigung erfordert.',
      unsupported: 'Nicht unterstützte Vorfallsform. Sicher abbrechen und eine manuelle Prüfung anfordern.',
    },
    verification: {
      readFailed: 'Ein erforderlicher schreibgeschützter Beweis-Lesevorgang ist fehlgeschlagen.',
      rejected: 'Die Validierung von Eigentümerschaft, Richtlinie oder Geltungsbereich hat den Lauf abgelehnt.',
      failedWithReasons: 'Verifizierung fehlgeschlagen: {reasons}',
      verifyReadOnly: 'Die Verifizierung verwendet ausschließlich schreibgeschützte Beobachtungen.',
    },
    evidence: {
      deploymentState: 'Bereitstellung {id} hat den Status {state}.',
      eventsRead: '{count} Bereitstellungsereignisse/Protokolleinträge für {id} gelesen.',
      envNamesRead: '{count} Namen von Umgebungsvariablen gelesen; Werte wurden nicht angefordert.',
      aliasesRead: '{count} Produktions-Aliase gelesen.',
      noIncident: 'Durch schreibgeschützte Beobachtung wurde kein Bereitstellungsvorfall erkannt.',
      healthyVerified: 'Fehlerfreies Ergebnis verifiziert, da die Beobachtung abgeschlossen wurde und keine Vorfälle gefunden hat.',
      incidentVerified: 'Vorfall-Zustandsanalyse verifiziert – mit exakten schreibgeschützten Bereitstellungsnachweisen, Identitätsbindung und ohne Änderungen oder Browserausführung.',
    },
  },
  fr: {
    steps: {
      readDeployment: 'Lisez les détails du déploiement Vercel échoué sélectionné avant de diagnostiquer.',
      readDeploymentExpected: 'L\'état du déploiement, la cible, les métadonnées du commit et un résumé d\'erreur nettoyé sont disponibles.',
      readEvents: 'Lisez les événements de déploiement et les journaux de build et d\'exécution du déploiement sélectionné.',
      readEventsExpected: 'Les résumés nettoyés des événements de build et des journaux sont disponibles sans valeurs secrètes.',
      readEnvNames: 'Inspectez uniquement les noms des variables d\'environnement configurées pour le projet et la cible ; ne lisez pas les valeurs secrètes.',
      readEnvNamesExpected: 'Seuls les noms et cibles des variables sont comparés ; les valeurs en clair ne sont jamais demandées.',
      readAliases: 'Inspectez les alias de production pour déterminer si le déploiement annulé a affecté l\'alias en production.',
      readAliasesExpected: 'Les pointeurs d\'alias peuvent être examinés sans modifier la production.',
      readConnection: 'Inspectez les métadonnées de connexion Vercel et les références de secrets requises sans exposer ni renouveler les valeurs secrètes.',
      verifyDiagnosis: 'Vérifiez que le diagnostic s\'est appuyé sur le déploiement sélectionné, les événements/journaux et toutes les lectures d\'alias ou de noms de variables d\'environnement requises.',
      stopExpected: 'Aucune exécution n\'est tentée pour les cas non pris en charge ou ambigus.',
    },
    stops: {
      missingDeploymentId: 'L\'incident de déploiement ne comportait pas d\'ID de déploiement ; un examen humain est requis.',
      missingRepeatedIds: 'L\'échec de déploiement répété ne comportait pas de deploymentIds ; un examen humain est requis.',
      unknownState: 'Un état Vercel inconnu nécessite un examen humain ou par le fournisseur après la collecte de preuves en lecture seule.',
      unsupportedShape: 'Forme d\'incident Vercel non prise en charge. Échouer de manière sécurisée et demander un examen humain.',
      unsupportedProvider: 'Fournisseur ou type d\'incident Vercel non pris en charge.',
      retryAfterBackoff: 'Relancez les lectures en lecture seule de l\'état et des déploiements Vercel après la fenêtre d\'attente limitée de l\'observateur.',
      rejectedByPolicy: 'La validation de la propriété, de la politique ou de la portée a rejeté l\'exécution.',
    },
    diagnoses: {
      deploymentFailed: 'Un déploiement a échoué. Diagnostiquez à partir du dernier déploiement échoué, de ses événements et des journaux nettoyés avant de proposer toute réparation.',
      repeatedFailure: 'Plusieurs déploiements récents ont échoué consécutivement. Comparez les déploiements échoués et leurs journaux pour identifier une cause racine commune.',
      stuckDeployment: 'Un déploiement semble bloqué au-delà du seuil configuré. Confirmez l\'état actuel du fournisseur et les événements avant toute intervention.',
      canceledProduction: 'Un déploiement de production a été annulé. Inspectez les alias de production pour déterminer si le trafic en production est affecté avant toute action de récupération.',
      unknownState: 'Le fournisseur a renvoyé un état de déploiement inconnu. Échouer de manière sécurisée et recueillir des détails en lecture seule pour un examen humain.',
      apiUnavailable: 'Les API de lecture du fournisseur sont indisponibles ou limitées en débit. N\'en déduisez aucune réparation de l\'application tant que les lectures du fournisseur ne sont pas rétablies.',
      authFailed: 'L\'observateur ne peut pas s\'authentifier. Traitez cela comme une tâche de configuration de la connexion au fournisseur nécessitant une approbation protégée.',
      unsupported: 'Forme d\'incident non prise en charge. Échouer de manière sécurisée et demander un examen humain.',
    },
    verification: {
      readFailed: 'Une lecture de preuve requise en lecture seule a échoué.',
      rejected: 'La validation de la propriété, de la politique ou de la portée a rejeté l\'exécution.',
      failedWithReasons: 'Échec de la vérification : {reasons}',
      verifyReadOnly: 'La vérification utilise uniquement des observations en lecture seule.',
    },
    evidence: {
      deploymentState: 'Le déploiement {id} est à l\'état {state}.',
      eventsRead: '{count} événements de déploiement/entrées de journal lus pour {id}.',
      envNamesRead: '{count} noms de variables d\'environnement lus ; les valeurs n\'ont pas été demandées.',
      aliasesRead: '{count} alias de production lus.',
      noIncident: 'Aucun incident de déploiement n\'a été détecté par l\'observation en lecture seule.',
      healthyVerified: 'Résultat sain vérifié, car l\'observation s\'est terminée sans détecter d\'incident.',
      incidentVerified: 'Analyse de santé de l\'incident vérifiée avec des preuves de déploiement exactes en lecture seule, une liaison d\'identité, et sans aucune modification ni exécution dans le navigateur.',
    },
  },
  it: {
    steps: {
      readDeployment: 'Leggi i dettagli del deployment Vercel non riuscito selezionato prima di eseguire la diagnosi.',
      readDeploymentExpected: 'Sono disponibili lo stato del deployment, la destinazione, i metadati del commit e un riepilogo sanificato dell\'errore.',
      readEvents: 'Leggi gli eventi del deployment e i log di build e di runtime del deployment selezionato.',
      readEventsExpected: 'I riepiloghi sanificati di eventi di build e log sono disponibili senza valori segreti.',
      readEnvNames: 'Ispeziona solo i nomi delle variabili d\'ambiente configurate per il progetto e la destinazione; non leggere i valori segreti.',
      readEnvNamesExpected: 'Vengono confrontati solo nomi e destinazioni delle variabili; i valori in chiaro non vengono mai richiesti.',
      readAliases: 'Ispeziona gli alias di produzione per stabilire se il deployment annullato ha influito sull\'alias attivo.',
      readAliasesExpected: 'I puntatori degli alias sono disponibili per la revisione senza modificare la produzione.',
      readConnection: 'Ispeziona i metadati della connessione Vercel e i riferimenti ai segreti richiesti senza esporre né ruotare i valori segreti.',
      verifyDiagnosis: 'Verifica che la diagnosi si sia basata sul deployment selezionato, sugli eventi/log e su tutte le letture necessarie di alias e nomi delle variabili d\'ambiente.',
      stopExpected: 'Non viene tentata alcuna esecuzione per i casi non supportati o ambigui.',
    },
    stops: {
      missingDeploymentId: 'L\'incidente di deployment non includeva un ID di deployment; è necessaria una revisione umana.',
      missingRepeatedIds: 'L\'errore di deployment ripetuto non includeva deploymentIds; è necessaria una revisione umana.',
      unknownState: 'Uno stato Vercel sconosciuto richiede una revisione umana o del provider dopo la raccolta di prove in sola lettura.',
      unsupportedShape: 'Forma di incidente Vercel non supportata. Interrompi in modo sicuro e richiedi una revisione umana.',
      unsupportedProvider: 'Provider o tipo di incidente Vercel non supportato.',
      retryAfterBackoff: 'Riprova le letture in sola lettura di stato e deployment Vercel dopo la finestra di backoff limitata dell\'osservatore.',
      rejectedByPolicy: 'La convalida di proprietà, policy o ambito ha rifiutato l\'esecuzione.',
    },
    diagnoses: {
      deploymentFailed: 'Un deployment non è riuscito. Esegui la diagnosi partendo dall\'ultimo deployment non riuscito, dai suoi eventi e dai log sanificati prima di proporre qualsiasi riparazione.',
      repeatedFailure: 'Diversi deployment recenti non sono riusciti in modo consecutivo. Confronta i deployment non riusciti e i log per individuare una causa principale comune.',
      stuckDeployment: 'Un deployment sembra bloccato oltre la soglia configurata. Conferma lo stato attuale del provider e gli eventi prima di qualsiasi intervento.',
      canceledProduction: 'Un deployment di produzione è stato annullato. Ispeziona gli alias di produzione per stabilire se il traffico attivo è interessato prima di qualsiasi azione di ripristino.',
      unknownState: 'Il provider ha restituito uno stato di deployment sconosciuto. Interrompi in modo sicuro e raccogli dettagli in sola lettura per una revisione umana.',
      apiUnavailable: 'Le API di lettura del provider non sono disponibili o sono soggette a limiti di frequenza. Non dedurre una riparazione dell\'applicazione finché le letture del provider non tornano a funzionare.',
      authFailed: 'L\'osservatore non riesce ad autenticarsi. Trattalo come un intervento di configurazione della connessione al provider che richiede un\'approvazione protetta.',
      unsupported: 'Forma di incidente non supportata. Interrompi in modo sicuro e richiedi una revisione umana.',
    },
    verification: {
      readFailed: 'Una lettura di prove obbligatoria in sola lettura non è riuscita.',
      rejected: 'La convalida di proprietà, policy o ambito ha rifiutato l\'esecuzione.',
      failedWithReasons: 'Verifica non riuscita: {reasons}',
      verifyReadOnly: 'La verifica utilizza solo osservazioni in sola lettura.',
    },
    evidence: {
      deploymentState: 'Lo stato del deployment {id} è {state}.',
      eventsRead: 'Letti {count} eventi di deployment/voci di log per {id}.',
      envNamesRead: 'Letti {count} nomi di variabili d\'ambiente; i valori non sono stati richiesti.',
      aliasesRead: 'Letti {count} alias di produzione.',
      noIncident: 'Nessun incidente di deployment rilevato dall\'osservazione in sola lettura.',
      healthyVerified: 'Risultato integro verificato perché l\'osservazione è stata completata e non ha rilevato incidenti.',
      incidentVerified: 'Analisi dello stato dell\'incidente verificata con prove di deployment esatte in sola lettura, associazione dell\'identità e nessuna modifica né esecuzione nel browser.',
    },
  },
  ja: {
    steps: {
      readDeployment: '診断の前に、選択した失敗した Vercel デプロイの詳細を確認します。',
      readDeploymentExpected: 'デプロイの状態、ターゲット、コミットのメタデータ、サニタイズ済みのエラー概要を参照できます。',
      readEvents: '選択したデプロイのデプロイイベントとビルド／ランタイムログを確認します。',
      readEventsExpected: 'サニタイズ済みのビルドイベント／ログ概要を、シークレット値なしで参照できます。',
      readEnvNames: 'プロジェクトとターゲットに設定された環境変数の名前のみを確認します。シークレット値は読み取らないでください。',
      readEnvNamesExpected: '比較するのは変数名／ターゲットのみで、平文の値は一切要求しません。',
      readAliases: '本番エイリアスを確認し、キャンセルされたデプロイが稼働中のエイリアスに影響したかどうかを判断します。',
      readAliasesExpected: '本番環境を変更することなく、エイリアスの参照先を確認できます。',
      readConnection: 'シークレット値を公開・ローテーションすることなく、Vercel 接続のメタデータと必要なシークレット参照を確認します。',
      verifyDiagnosis: '診断が、選択したデプロイ、イベント／ログ、および必要なエイリアス／環境変数名の読み取りに基づいていたことを検証します。',
      stopExpected: 'サポート対象外または曖昧なケースでは、実行を試みません。',
    },
    stops: {
      missingDeploymentId: 'デプロイインシデントにデプロイ ID が含まれていませんでした。人による確認が必要です。',
      missingRepeatedIds: '繰り返し発生したデプロイ失敗に deploymentIds が含まれていませんでした。人による確認が必要です。',
      unknownState: 'Vercel の状態が不明な場合は、読み取り専用の証拠収集後に人またはプロバイダーによる確認が必要です。',
      unsupportedShape: 'サポート対象外の Vercel インシデント形式です。安全側で停止し、人による確認を依頼してください。',
      unsupportedProvider: 'サポート対象外のプロバイダーまたは Vercel インシデントタイプです。',
      retryAfterBackoff: 'オブザーバーの上限付きバックオフ期間の経過後に、読み取り専用の Vercel ステータス／デプロイの読み取りを再試行します。',
      rejectedByPolicy: '所有権、ポリシー、またはスコープの検証により実行が拒否されました。',
    },
    diagnoses: {
      deploymentFailed: 'デプロイが失敗しました。修復を提案する前に、最新の失敗したデプロイ、そのイベント、サニタイズ済みログから診断してください。',
      repeatedFailure: '直近の複数のデプロイが連続して失敗しました。失敗したデプロイとログを比較し、共通の根本原因を特定してください。',
      stuckDeployment: 'デプロイが設定されたしきい値を超えて停滞しているようです。介入する前に、プロバイダーの現在の状態とイベントを確認してください。',
      canceledProduction: '本番デプロイがキャンセルされました。復旧操作の前に、本番エイリアスを確認して稼働中のトラフィックに影響があるかどうかを判断してください。',
      unknownState: 'プロバイダーが不明なデプロイ状態を返しました。安全側で停止し、人による確認のために読み取り専用の詳細を収集してください。',
      apiUnavailable: 'プロバイダーの読み取り API が利用できないか、レート制限されています。プロバイダーの読み取りが回復するまで、アプリケーションの修復を推測しないでください。',
      authFailed: 'オブザーバーが認証できません。保護された承認が必要な、プロバイダー接続の設定作業として扱ってください。',
      unsupported: 'サポート対象外のインシデント形式です。安全側で停止し、人による確認を依頼してください。',
    },
    verification: {
      readFailed: '必須の読み取り専用の証拠読み取りが失敗しました。',
      rejected: '所有権、ポリシー、またはスコープの検証により実行が拒否されました。',
      failedWithReasons: '検証に失敗しました：{reasons}',
      verifyReadOnly: '検証には読み取り専用の観測のみを使用します。',
    },
    evidence: {
      deploymentState: 'デプロイ {id} の状態は {state} です。',
      eventsRead: '{id} のデプロイイベント／ログエントリを {count} 件読み取りました。',
      envNamesRead: '環境変数名を {count} 件読み取りました。値は要求していません。',
      aliasesRead: '本番エイリアスを {count} 件読み取りました。',
      noIncident: '読み取り専用の観測では、デプロイインシデントは検出されませんでした。',
      healthyVerified: '観測が完了し、インシデントが見つからなかったため、正常な結果として検証されました。',
      incidentVerified: '正確な読み取り専用のデプロイ証拠と ID バインディングにより、変更やブラウザー実行を伴わずにインシデントの健全性分析を検証しました。',
    },
  },
  ko: {
    steps: {
      readDeployment: '진단하기 전에 선택한 실패한 Vercel 배포의 세부 정보를 읽으세요.',
      readDeploymentExpected: '배포 상태, 대상, 커밋 메타데이터 및 정제된 오류 요약을 사용할 수 있습니다.',
      readEvents: '선택한 배포의 배포 이벤트와 빌드/런타임 로그를 읽으세요.',
      readEventsExpected: '정제된 빌드 이벤트/로그 요약을 비밀 값 없이 사용할 수 있습니다.',
      readEnvNames: '프로젝트와 대상에 구성된 환경 변수 이름만 검사하세요. 비밀 값은 읽지 마세요.',
      readEnvNamesExpected: '변수 이름/대상만 비교하며 평문 값은 절대 요청하지 않습니다.',
      readAliases: '프로덕션 별칭을 검사하여 취소된 배포가 라이브 별칭에 영향을 주었는지 확인하세요.',
      readAliasesExpected: '프로덕션을 수정하지 않고 별칭 포인터를 검토할 수 있습니다.',
      readConnection: '비밀 값을 노출하거나 교체하지 않고 Vercel 연결 메타데이터와 필수 비밀 참조를 검사하세요.',
      verifyDiagnosis: '진단이 선택한 배포, 이벤트/로그 및 필요한 별칭/환경 변수 이름 읽기에 기반했는지 확인하세요.',
      stopExpected: '지원되지 않거나 모호한 경우에는 실행을 시도하지 않습니다.',
    },
    stops: {
      missingDeploymentId: '배포 인시던트에 배포 ID가 포함되지 않았습니다. 사람의 검토가 필요합니다.',
      missingRepeatedIds: '반복된 배포 실패에 deploymentIds가 포함되지 않았습니다. 사람의 검토가 필요합니다.',
      unknownState: '알 수 없는 Vercel 상태는 읽기 전용 증거 수집 후 사람 또는 공급자의 검토가 필요합니다.',
      unsupportedShape: '지원되지 않는 Vercel 인시던트 형태입니다. 안전하게 중단하고 사람의 검토를 요청하세요.',
      unsupportedProvider: '지원되지 않는 공급자 또는 Vercel 인시던트 유형입니다.',
      retryAfterBackoff: '관찰자의 제한된 백오프 기간이 지난 후 읽기 전용 Vercel 상태/배포 읽기를 다시 시도하세요.',
      rejectedByPolicy: '소유권, 정책 또는 범위 검증에서 실행이 거부되었습니다.',
    },
    diagnoses: {
      deploymentFailed: '배포가 실패했습니다. 복구를 제안하기 전에 가장 최근에 실패한 배포, 해당 이벤트 및 정제된 로그를 바탕으로 진단하세요.',
      repeatedFailure: '최근 여러 배포가 연속으로 실패했습니다. 실패한 배포와 로그를 비교하여 공통 근본 원인을 파악하세요.',
      stuckDeployment: '배포가 구성된 임계값을 넘어 멈춰 있는 것으로 보입니다. 개입하기 전에 현재 공급자 상태와 이벤트를 확인하세요.',
      canceledProduction: '프로덕션 배포가 취소되었습니다. 복구 조치를 취하기 전에 프로덕션 별칭을 검사하여 라이브 트래픽이 영향을 받는지 확인하세요.',
      unknownState: '공급자가 알 수 없는 배포 상태를 반환했습니다. 안전하게 중단하고 사람의 검토를 위해 읽기 전용 세부 정보를 수집하세요.',
      apiUnavailable: '공급자 읽기 API를 사용할 수 없거나 속도 제한이 걸려 있습니다. 공급자 읽기가 복구될 때까지 애플리케이션 복구를 추론하지 마세요.',
      authFailed: '관찰자가 인증할 수 없습니다. 보호된 승인이 필요한 공급자 연결 구성 작업으로 처리하세요.',
      unsupported: '지원되지 않는 인시던트 형태입니다. 안전하게 중단하고 사람의 검토를 요청하세요.',
    },
    verification: {
      readFailed: '필수 읽기 전용 증거 읽기가 실패했습니다.',
      rejected: '소유권, 정책 또는 범위 검증에서 실행이 거부되었습니다.',
      failedWithReasons: '검증 실패: {reasons}',
      verifyReadOnly: '검증은 읽기 전용 관찰만 사용합니다.',
    },
    evidence: {
      deploymentState: '배포 {id}의 상태는 {state}입니다.',
      eventsRead: '{id}의 배포 이벤트/로그 항목 {count}개를 읽었습니다.',
      envNamesRead: '환경 변수 이름 {count}개를 읽었습니다. 값은 요청하지 않았습니다.',
      aliasesRead: '프로덕션 별칭 {count}개를 읽었습니다.',
      noIncident: '읽기 전용 관찰에서 배포 인시던트가 감지되지 않았습니다.',
      healthyVerified: '관찰이 완료되었고 인시던트가 발견되지 않았으므로 정상 결과로 검증되었습니다.',
      incidentVerified: '정확한 읽기 전용 배포 증거와 ID 바인딩으로, 변경이나 브라우저 실행 없이 인시던트 상태 분석이 검증되었습니다.',
    },
  },
  ar: {
    steps: {
      readDeployment: 'اقرأ تفاصيل عملية نشر Vercel الفاشلة المحددة قبل التشخيص.',
      readDeploymentExpected: 'تتوفر حالة النشر والهدف وبيانات تعريف الـ commit وملخص منقّح للخطأ.',
      readEvents: 'اقرأ أحداث النشر وسجلات البناء ووقت التشغيل لعملية النشر المحددة.',
      readEventsExpected: 'تتوفر ملخصات منقّحة لأحداث البناء والسجلات دون قيم سرية.',
      readEnvNames: 'افحص أسماء متغيرات البيئة المُكوّنة للمشروع والهدف فقط؛ ولا تقرأ القيم السرية.',
      readEnvNamesExpected: 'تتم مقارنة أسماء المتغيرات وأهدافها فقط؛ ولا يُطلب أبدًا أي قيم بنص عادي.',
      readAliases: 'افحص الأسماء المستعارة للإنتاج لتحديد ما إذا كانت عملية النشر الملغاة قد أثّرت في الاسم المستعار المباشر.',
      readAliasesExpected: 'تتوفر مؤشرات الأسماء المستعارة للمراجعة دون تعديل بيئة الإنتاج.',
      readConnection: 'افحص بيانات تعريف اتصال Vercel ومراجع الأسرار المطلوبة دون كشف القيم السرية أو تدويرها.',
      verifyDiagnosis: 'تحقّق من أن التشخيص استند إلى عملية النشر المحددة والأحداث/السجلات وأي قراءات مطلوبة للأسماء المستعارة أو أسماء متغيرات البيئة.',
      stopExpected: 'لا تتم محاولة أي تنفيذ في الحالات غير المدعومة أو الغامضة.',
    },
    stops: {
      missingDeploymentId: 'لم يتضمن حادث النشر معرّف نشر؛ تلزم مراجعة بشرية.',
      missingRepeatedIds: 'لم يتضمن فشل النشر المتكرر قيم deploymentIds؛ تلزم مراجعة بشرية.',
      unknownState: 'تتطلب حالة Vercel غير المعروفة مراجعة بشرية أو من المزوّد بعد جمع الأدلة للقراءة فقط.',
      unsupportedShape: 'شكل حادث Vercel غير مدعوم. أوقف التنفيذ بأمان واطلب مراجعة بشرية.',
      unsupportedProvider: 'مزوّد أو نوع حادث Vercel غير مدعوم.',
      retryAfterBackoff: 'أعد محاولة قراءات حالة Vercel وعمليات النشر للقراءة فقط بعد انقضاء نافذة التراجع المحدودة للمراقب.',
      rejectedByPolicy: 'رفض التحقق من الملكية أو السياسة أو النطاق عملية التشغيل.',
    },
    diagnoses: {
      deploymentFailed: 'فشلت عملية نشر. شخّص المشكلة انطلاقًا من أحدث عملية نشر فاشلة وأحداثها وسجلاتها المنقّحة قبل اقتراح أي إصلاح.',
      repeatedFailure: 'فشلت عدة عمليات نشر حديثة على التوالي. قارن عمليات النشر الفاشلة وسجلاتها لتحديد سبب جذري مشترك.',
      stuckDeployment: 'يبدو أن عملية نشر عالقة لمدة تتجاوز الحد المُكوّن. تأكّد من الحالة الحالية لدى المزوّد ومن الأحداث قبل أي تدخل.',
      canceledProduction: 'أُلغيت عملية نشر في الإنتاج. افحص الأسماء المستعارة للإنتاج لتحديد ما إذا كانت حركة المرور المباشرة متأثرة قبل اتخاذ أي إجراء استرداد.',
      unknownState: 'أعاد المزوّد حالة نشر غير معروفة. أوقف التنفيذ بأمان واجمع تفاصيل للقراءة فقط من أجل المراجعة البشرية.',
      apiUnavailable: 'واجهات API للقراءة لدى المزوّد غير متاحة أو خاضعة لتقييد المعدل. لا تستنتج أي إصلاح للتطبيق حتى تتعافى قراءات المزوّد.',
      authFailed: 'يتعذّر على المراقب المصادقة. تعامل مع ذلك على أنه عمل لتكوين اتصال المزوّد يتطلب موافقة محمية.',
      unsupported: 'شكل حادث غير مدعوم. أوقف التنفيذ بأمان واطلب مراجعة بشرية.',
    },
    verification: {
      readFailed: 'فشلت قراءة مطلوبة للأدلة للقراءة فقط.',
      rejected: 'رفض التحقق من الملكية أو السياسة أو النطاق عملية التشغيل.',
      failedWithReasons: 'فشل التحقق: {reasons}',
      verifyReadOnly: 'يعتمد التحقق على ملاحظات للقراءة فقط.',
    },
    evidence: {
      deploymentState: 'حالة عملية النشر {id} هي {state}.',
      eventsRead: 'تمت قراءة {count} من أحداث النشر/إدخالات السجل لـ {id}.',
      envNamesRead: 'تمت قراءة {count} من أسماء متغيرات البيئة؛ ولم تُطلب القيم.',
      aliasesRead: 'تمت قراءة {count} من الأسماء المستعارة للإنتاج.',
      noIncident: 'لم تكتشف الملاحظة للقراءة فقط أي حادث نشر.',
      healthyVerified: 'تم التحقق من سلامة النتيجة لأن الملاحظة اكتملت ولم تجد أي حوادث.',
      incidentVerified: 'تم التحقق من تحليل سلامة الحادث بأدلة نشر دقيقة للقراءة فقط وربط للهوية، ودون أي تعديل أو تنفيذ عبر المتصفح.',
    },
  },
}

/** Plan, stop and evidence text for a locale, falling back to English. */
export function observationCopy(locale?: string | null): ObservationCopy {
  return COPY[resolveSupervisorLocale(locale)]
}

/**
 * Fill named placeholders. Named rather than positional so a translator may reorder a sentence
 * freely — several of these languages put the subject last where English puts it first.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole))
}
