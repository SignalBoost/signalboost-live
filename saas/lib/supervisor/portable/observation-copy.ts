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
