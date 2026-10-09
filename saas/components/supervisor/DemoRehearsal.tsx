// saas/components/supervisor/DemoRehearsal.tsx
//
// THE ON-DEMAND HALF OF THE DEMO — two things a prospect can watch you press.
//
// 1. THE APPROVAL REHEARSAL runs one rehearsal incident per risk category against this
//    deployment's real wiring. A consequential step is REQUIRED to pause; if it ever
//    executed, the run reports FAILED. The approver is notified through the real channel,
//    which means real email actually arrives.
//
// 2. THE INCIDENT DRILL sends a synthetic incident through the REAL intake path — the
//    signed webhook source, real authentication, deduplication, storage, the triage
//    thinker, the policy engine, and the entitlement gate. This is the licence-gated path:
//    with no licence installed it refuses at diagnosis and says so, which is the honest
//    way to demonstrate that the gate exists.
//
// BOTH ARE LABELLED FOR WHAT THEY ARE, everywhere they appear. A rehearsal shown as a
// rehearsal and a drill shown as a drill are honest demonstrations of the gating,
// notification, diagnosis and audit paths. The same output presented as production history
// would be a fabricated audit trail, which is the one thing that would destroy the
// proposition being sold. On screen the two must never look alike.
//
// NEITHER EXECUTES A REPAIR, and the copy says so rather than leaving it to be discovered.
// This deployment configures no execution step runner, so the drill's orchestration ends
// unresolved and records why. That is disclosed behaviour, documented in the integration
// guide, not a defect to be hidden during a demo.

'use client'

import { useState } from 'react'
import { uiText } from '@/lib/i18n/uiText'
import { DEMO_PUBLISH_COPY, type DemoPublishLanguage } from '@/lib/i18n/demoPublishCopy'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

type Check = { id: string; title: string; passed: boolean; detail: string }
type Run = { category: string; passed: boolean; checks: Check[]; auditEventTypes: string[]; notificationCount?: number; summary: string }
type AcceptanceRecord = {
  ok?: boolean
  passed?: boolean
  ranAt?: string
  productName?: string
  runs?: Run[]
  blocking?: string[]
  meaning?: string
  error?: string
  remedy?: string
}

type DrillRecord = {
  ok?: boolean
  drill?: boolean
  ranAt?: string
  licence?: { configured?: boolean; reason?: string }
  delivery?: { status?: string; incidentId?: string | null; outcome?: string | null; reason?: string | null }
  auditEventTypes?: string[]
  meaning?: string
  error?: string
  remedy?: string
}

type RehearsalCopy = {
  heading: string
  intro: string
  rehearsalBadge: string
  rehearsalNote: string
  runButton: string
  runningButton: string
  runningNote: string
  requestFailed: string
  didNotComplete: string
  notRun: string
  passed: string
  failed: string
  pass: string
  fail: string
  auditEvents: string
  notifications: string
  ranAtLabel: string
  drillHeading: string
  drillIntro: string
  drillBadge: string
  drillNote: string
  drillButton: string
  drillRunningButton: string
  drillRunningNote: string
  deliveryLabel: string
  incidentLabel: string
  outcomeLabel: string
  licenceLabel: string
  licenceOk: string
  licenceMissing: string
}

const COPY: Record<Language, RehearsalCopy> = {
  en: {
    heading: uiText('generatedUi.u_77525ef1bd4ad8a2'),
    intro: uiText('generatedUi.u_23693ad03ec29c90'),
    rehearsalBadge: uiText('generatedUi.u_28100fcd551b3b32'),
    rehearsalNote: uiText('generatedUi.u_cb34e90b5739f252'),
    runButton: uiText('generatedUi.u_5b0015fd075f755a'),
    runningButton: uiText('generatedUi.u_5dd3a0fdd5b2f4f8'),
    runningNote: uiText('generatedUi.u_44499e90e51f39da'),
    requestFailed: uiText('generatedUi.u_cfce761befa84073'),
    didNotComplete: uiText('generatedUi.u_eb76c07d7a0d2231'),
    notRun: uiText('generatedUi.u_25f0c23a0878a1de'),
    passed: uiText('generatedUi.u_436fe71bb9561f05'),
    failed: uiText('generatedUi.u_031a8f0f659df890'),
    pass: uiText('generatedUi.u_2f9acb02faa121bb'),
    fail: uiText('generatedUi.u_425305e25df9df10'),
    auditEvents: uiText('generatedUi.u_cc672a8a17a0ef3f'),
    notifications: uiText('generatedUi.u_3b301f5885682323'),
    ranAtLabel: uiText('generatedUi.u_4b4c31294fb5b71b'),
    drillHeading: uiText('generatedUi.u_abf4903ad7669248'),
    drillIntro: uiText('generatedUi.u_3ba49267395e4e68'),
    drillBadge: uiText('generatedUi.u_0e2113782a3d0373'),
    drillNote: uiText('generatedUi.u_c03ac3d56b3ba559'),
    drillButton: uiText('generatedUi.u_694c2e9870bbe98b'),
    drillRunningButton: uiText('generatedUi.u_f0112a0a0e57c590'),
    drillRunningNote: uiText('generatedUi.u_de701adeff836886'),
    deliveryLabel: uiText('generatedUi.u_52bfe584a5fc4505'),
    incidentLabel: uiText('generatedUi.u_36a606d4886552e8'),
    outcomeLabel: uiText('generatedUi.u_4e80abb5b14656d4'),
    licenceLabel: uiText('generatedUi.u_f3ec8e880a46c8a6'),
    licenceOk: uiText('generatedUi.u_a51a6c19a1ffc741'),
    licenceMissing: uiText('generatedUi.u_39b70849d4ed7a0f'),
  },
  es: {
    heading: 'Ejecutar un ensayo ahora',
    intro: 'Ejecuta un incidente de ensayo por cada categoría de riesgo contra el cableado real de este despliegue. Un paso seguro se ejecuta, un paso consecuente debe detenerse, la persona aprobadora recibe aviso por el canal real y se produce un registro de auditoría. Nada consecuente puede ejecutarse: el paso peligroso está obligado a detenerse.',
    rehearsalBadge: 'Ensayo',
    rehearsalNote: 'Esto es un ensayo, no una reparación en producción. Demuestra que la aprobación, el aviso y la auditoría funcionan aquí. No es prueba de que se haya resuelto un incidente real.',
    runButton: 'Ejecutar ensayo',
    runningButton: 'Ejecutando las tres categorías…',
    runningNote: 'Se están enviando avisos reales. Tarda unos segundos.',
    requestFailed: 'La solicitud falló',
    didNotComplete: 'La solicitud no se completó',
    notRun: 'No ejecutado',
    passed: 'Superado',
    failed: 'Fallido',
    pass: 'CORRECTO',
    fail: 'FALLO',
    auditEvents: 'Eventos de auditoría',
    notifications: 'Avisos enviados',
    ranAtLabel: 'Ejecutado el',
    drillHeading: 'Generar un incidente de prueba',
    drillIntro: 'Envía un incidente sintético por la misma ruta que sigue una alerta de monitorización: webhook firmado, autenticación, deduplicación, almacenamiento, triaje y motor de políticas. Nada está simulado ni se omite.',
    drillBadge: 'Prueba',
    drillNote: 'No se ejecuta ninguna reparación. Este despliegue no configura ningún ejecutor de pasos, por lo que la ejecución termina sin resolver y registra el motivo, en lugar de afirmar una corrección que no ocurrió.',
    drillButton: 'Generar incidente de prueba',
    drillRunningButton: 'Entregando…',
    drillRunningNote: 'El incidente se está autenticando, almacenando y diagnosticando.',
    deliveryLabel: 'Entrega',
    incidentLabel: 'Incidente',
    outcomeLabel: 'Resultado',
    licenceLabel: 'Licencia',
    licenceOk: 'instalada',
    licenceMissing: 'no instalada: el diagnóstico se rechaza',
  },
  pt: {
    heading: 'Executar um ensaio agora',
    intro: 'Executa um incidente de ensaio por categoria de risco contra a ligação real deste ambiente. Um passo seguro é executado, um passo consequente tem de parar, o aprovador é avisado pelo canal real e é produzido um registo de auditoria. Nada de consequente pode ser executado: o passo perigoso é obrigado a parar.',
    rehearsalBadge: 'Ensaio',
    rehearsalNote: 'Isto é um ensaio, não uma reparação em produção. Prova que a aprovação, o aviso e a auditoria funcionam aqui. Não é prova de que um incidente real foi resolvido.',
    runButton: 'Executar ensaio',
    runningButton: 'A executar as três categorias…',
    runningNote: 'Estão a ser enviados avisos reais. Demora alguns segundos.',
    requestFailed: 'O pedido falhou',
    didNotComplete: 'O pedido não foi concluído',
    notRun: 'Não executado',
    passed: 'Aprovado',
    failed: 'Reprovado',
    pass: 'OK',
    fail: 'FALHA',
    auditEvents: 'Eventos de auditoria',
    notifications: 'Avisos enviados',
    ranAtLabel: 'Executado em',
    drillHeading: 'Levantar um incidente de treino',
    drillIntro: 'Envia um incidente sintético pelo mesmo caminho de um alerta de monitorização: webhook assinado, autenticação, deduplicação, armazenamento, triagem e motor de políticas. Nada é simulado nem contornado.',
    drillBadge: 'Treino',
    drillNote: 'Nenhuma reparação é executada. Este ambiente não configura um executor de passos, por isso a execução termina por resolver e regista o motivo, em vez de alegar uma correção que não aconteceu.',
    drillButton: 'Levantar incidente de treino',
    drillRunningButton: 'A entregar…',
    drillRunningNote: 'O incidente está a ser autenticado, armazenado e diagnosticado.',
    deliveryLabel: 'Entrega',
    incidentLabel: 'Incidente',
    outcomeLabel: 'Resultado',
    licenceLabel: 'Licença',
    licenceOk: 'instalada',
    licenceMissing: 'não instalada — o diagnóstico é recusado',
  },
  pl: {
    heading: 'Uruchom próbę teraz',
    intro: 'Uruchamia jeden próbny incydent dla każdej kategorii ryzyka na rzeczywistej konfiguracji tego wdrożenia. Bezpieczny krok zostaje wykonany, krok o istotnych skutkach musi się zatrzymać, osoba zatwierdzająca otrzymuje powiadomienie prawdziwym kanałem, a ślad audytowy zostaje zapisany. Nic istotnego nie może się wykonać — niebezpieczny krok musi się zatrzymać.',
    rehearsalBadge: 'Próba',
    rehearsalNote: 'To jest próba, a nie naprawa na produkcji. Dowodzi, że zatwierdzanie, powiadomienia i audyt działają tutaj. Nie jest dowodem, że rzeczywisty incydent został naprawiony.',
    runButton: 'Uruchom próbę',
    runningButton: 'Trwa wykonywanie trzech kategorii…',
    runningNote: 'Wysyłane są prawdziwe powiadomienia. Zajmuje to kilka sekund.',
    requestFailed: 'Żądanie nie powiodło się',
    didNotComplete: 'Żądanie nie zostało ukończone',
    notRun: 'Nie uruchomiono',
    passed: 'Zaliczone',
    failed: 'Niezaliczone',
    pass: 'OK',
    fail: 'BŁĄD',
    auditEvents: 'Zdarzenia audytowe',
    notifications: 'Wysłane powiadomienia',
    ranAtLabel: 'Uruchomiono',
    drillHeading: 'Zgłoś incydent ćwiczebny',
    drillIntro: 'Wysyła syntetyczny incydent tą samą drogą co alert z monitoringu: podpisany webhook, uwierzytelnienie, deduplikacja, zapis, triaż i silnik polityk. Nic nie jest zasymulowane ani pominięte.',
    drillBadge: 'Ćwiczenie',
    drillNote: 'Żadna naprawa nie zostaje wykonana. To wdrożenie nie konfiguruje modułu wykonawczego, więc przebieg kończy się bez rozwiązania i zapisuje powód, zamiast twierdzić, że coś naprawiono.',
    drillButton: 'Zgłoś incydent ćwiczebny',
    drillRunningButton: 'Dostarczanie…',
    drillRunningNote: 'Incydent jest uwierzytelniany, zapisywany i diagnozowany.',
    deliveryLabel: 'Dostarczenie',
    incidentLabel: 'Incydent',
    outcomeLabel: 'Wynik',
    licenceLabel: 'Licencja',
    licenceOk: 'zainstalowana',
    licenceMissing: 'brak — diagnoza jest odrzucana',
  },
  ru: {
    heading: 'Запустить репетицию сейчас',
    intro: 'Запускает по одному репетиционному инциденту на каждую категорию риска на реальной конфигурации этого развёртывания. Безопасный шаг выполняется, значимый шаг обязан остановиться, согласующий получает уведомление по реальному каналу, и формируется журнал аудита. Ничего значимого выполниться не может — опасный шаг обязан остановиться.',
    rehearsalBadge: 'Репетиция',
    rehearsalNote: 'Это репетиция, а не восстановление в продакшене. Она доказывает, что согласование, уведомление и аудит здесь работают. Она не является доказательством того, что реальный инцидент был устранён.',
    runButton: 'Запустить репетицию',
    runningButton: 'Выполняются все три категории…',
    runningNote: 'Отправляются реальные уведомления. Это занимает несколько секунд.',
    requestFailed: 'Запрос не выполнен',
    didNotComplete: 'Запрос не был завершён',
    notRun: 'Не запускалось',
    passed: 'Пройдено',
    failed: 'Не пройдено',
    pass: 'ОК',
    fail: 'СБОЙ',
    auditEvents: 'События аудита',
    notifications: 'Отправлено уведомлений',
    ranAtLabel: 'Запущено',
    drillHeading: 'Создать учебный инцидент',
    drillIntro: 'Отправляет синтетический инцидент по тому же пути, что и реальное оповещение мониторинга: подписанный вебхук, аутентификация, дедупликация, хранение, триаж и движок политик. Ничего не заглушено и не обойдено.',
    drillBadge: 'Учение',
    drillNote: 'Восстановление не выполняется. В этом развёртывании не настроен исполнитель шагов, поэтому запуск завершается без решения и записывает причину, а не заявляет об исправлении, которого не было.',
    drillButton: 'Создать учебный инцидент',
    drillRunningButton: 'Доставка…',
    drillRunningNote: 'Инцидент аутентифицируется, сохраняется и диагностируется.',
    deliveryLabel: 'Доставка',
    incidentLabel: 'Инцидент',
    outcomeLabel: 'Итог',
    licenceLabel: 'Лицензия',
    licenceOk: 'установлена',
    licenceMissing: 'не установлена — в диагностике отказано',
  },
  de: {
    heading: 'Jetzt einen Probelauf starten',
    intro: 'Führt pro Risikokategorie einen Probevorfall gegen die echte Verkabelung dieser Bereitstellung aus. Ein sicherer Schritt wird ausgeführt, ein folgenreicher Schritt muss pausieren, der Genehmiger wird über den echten Kanal benachrichtigt und ein Audit-Trail wird erstellt. Nichts Folgenreiches kann ausgeführt werden – der gefährliche Schritt muss pausieren.',
    rehearsalBadge: 'Probelauf',
    rehearsalNote: 'Dies ist eine Probe, keine Produktionsreparatur. Sie belegt, dass der Freigabe-, Benachrichtigungs- und Audit-Pfad hier funktioniert. Sie ist kein Nachweis, dass ein echter Vorfall behoben wurde.',
    runButton: 'Probelauf starten',
    runningButton: 'Alle drei Kategorien werden ausgeführt…',
    runningNote: 'Echte Benachrichtigungen werden gesendet. Dies dauert einige Sekunden.',
    requestFailed: 'Anfrage fehlgeschlagen',
    didNotComplete: 'Die Anfrage wurde nicht abgeschlossen',
    notRun: 'Nicht ausgeführt',
    passed: 'Bestanden',
    failed: 'Fehlgeschlagen',
    pass: 'BESTANDEN',
    fail: 'FEHLER',
    auditEvents: 'Audit-Ereignisse',
    notifications: 'Gesendete Benachrichtigungen',
    ranAtLabel: 'Ausführen um',
    drillHeading: 'Übungsvorfall auslösen',
    drillIntro: 'Sendet einen synthetischen Vorfall über denselben Weg wie eine Monitoring-Warnung: signierter Webhook, Authentifizierung, Deduplizierung, Speicherung, Triage und die Richtlinien-Engine. Nichts wird simuliert und nichts wird umgangen.',
    drillBadge: 'Übung',
    drillNote: 'Es wird keine Reparatur ausgeführt. Diese Bereitstellung konfiguriert keinen Ausführungsschritt-Runner, daher endet der Lauf ungelöst und protokolliert den Grund, anstatt eine Behebung zu behaupten, die nicht stattgefunden hat.',
    drillButton: 'Übungsvorfall auslösen',
    drillRunningButton: 'Wird zugestellt…',
    drillRunningNote: 'Der Vorfall wird authentifiziert, gespeichert und diagnostiziert.',
    deliveryLabel: 'Zustellung',
    incidentLabel: 'Vorfall',
    outcomeLabel: 'Ergebnis',
    licenceLabel: 'Lizenz',
    licenceOk: 'installiert',
    licenceMissing: 'nicht installiert – Diagnose verweigert',
  },
  fr: {
    heading: 'Lancer une répétition maintenant',
    intro: 'Exécute un incident de répétition par catégorie de risque sur le câblage réel de ce déploiement. Une étape sûre s’exécute, une étape à conséquences doit se mettre en pause, l’approbateur est notifié via le canal réel et une piste d’audit est produite. Rien de conséquent ne peut s’exécuter : l’étape dangereuse doit obligatoirement se mettre en pause.',
    rehearsalBadge: 'Répétition',
    rehearsalNote: 'Il s’agit d’une répétition, pas d’une réparation en production. Elle prouve que le circuit de contrôle, de notification et d’audit fonctionne ici. Ce n’est pas la preuve qu’un incident réel a été corrigé.',
    runButton: 'Lancer la répétition',
    runningButton: 'Exécution des trois catégories…',
    runningNote: 'De vraies notifications sont en cours d’envoi. Cela prend quelques secondes.',
    requestFailed: 'Échec de la requête',
    didNotComplete: 'La requête n’a pas abouti',
    notRun: 'Non exécuté',
    passed: 'Réussi',
    failed: 'Échec',
    pass: 'RÉUSSI',
    fail: 'ÉCHEC',
    auditEvents: 'Événements d’audit',
    notifications: 'Notifications envoyées',
    ranAtLabel: 'Exécuter à',
    drillHeading: 'Déclencher un incident d’exercice',
    drillIntro: 'Envoie un incident synthétique par le même chemin qu’une alerte de supervision : webhook signé, authentification, déduplication, stockage, triage et moteur de politiques. Rien n’est simulé et rien n’est contourné.',
    drillBadge: 'Exercice',
    drillNote: 'Aucune réparation n’est exécutée. Ce déploiement ne configure aucun exécuteur d’étapes, l’exécution se termine donc sans résolution et en consigne la raison, plutôt que de revendiquer une correction qui n’a pas eu lieu.',
    drillButton: 'Déclencher un incident d’exercice',
    drillRunningButton: 'Livraison…',
    drillRunningNote: 'L’incident est en cours d’authentification, d’enregistrement et de diagnostic.',
    deliveryLabel: 'Livraison',
    incidentLabel: 'Incident',
    outcomeLabel: 'Résultat',
    licenceLabel: 'Licence',
    licenceOk: 'installé',
    licenceMissing: 'non installé — diagnostic refusé',
  },
  it: {
    heading: 'Esegui ora una prova',
    intro: 'Esegue un incidente di prova per ciascuna categoria di rischio sul cablaggio reale di questo deployment. Un passaggio sicuro viene eseguito, un passaggio con conseguenze deve fermarsi, l’approvatore viene avvisato tramite il canale reale e viene prodotto un audit trail. Nulla di rilevante può essere eseguito: il passaggio pericoloso deve obbligatoriamente fermarsi.',
    rehearsalBadge: 'Prova generale',
    rehearsalNote: 'Questa è una prova generale, non una riparazione in produzione. Dimostra che il percorso di controllo, notifica e audit funziona qui. Non è la prova che un incidente reale sia stato risolto.',
    runButton: 'Esegui prova',
    runningButton: 'Esecuzione di tutte e tre le categorie…',
    runningNote: 'Sono in corso di invio notifiche reali. L’operazione richiede alcuni secondi.',
    requestFailed: 'Richiesta non riuscita',
    didNotComplete: 'La richiesta non è stata completata',
    notRun: 'Non eseguito',
    passed: 'Superato',
    failed: 'Non riuscito',
    pass: 'SUPERATO',
    fail: 'NON RIUSCITO',
    auditEvents: 'Eventi di audit',
    notifications: 'Notifiche inviate',
    ranAtLabel: 'Esegui alle',
    drillHeading: 'Genera un incidente di esercitazione',
    drillIntro: 'Invia un incidente sintetico lungo lo stesso percorso di un avviso di monitoraggio: webhook firmato, autenticazione, deduplicazione, archiviazione, triage e motore delle policy. Nulla è simulato e nulla viene aggirato.',
    drillBadge: 'Esercitazione',
    drillNote: 'Nessuna riparazione viene eseguita. Questo deployment non configura alcun runner per i passaggi di esecuzione, quindi l’esecuzione termina senza risoluzione e ne registra il motivo, invece di dichiarare una correzione mai avvenuta.',
    drillButton: 'Genera incidente di esercitazione',
    drillRunningButton: 'Consegna in corso…',
    drillRunningNote: 'L’incidente è in fase di autenticazione, archiviazione e diagnosi.',
    deliveryLabel: 'Consegna',
    incidentLabel: 'Incidente',
    outcomeLabel: 'Esito',
    licenceLabel: 'Licenza',
    licenceOk: 'installato',
    licenceMissing: 'non installato: la diagnosi viene rifiutata',
  },
  ja: {
    heading: '今すぐリハーサルを実行',
    intro: 'このデプロイの実際の接続に対して、リスクカテゴリーごとに 1 件のリハーサルインシデントを実行します。安全なステップは実行され、影響の大きいステップは一時停止が必須となり、承認者には実際のチャネルで通知され、監査証跡が生成されます。影響の大きい操作は実行できません。危険なステップは必ず一時停止します。',
    rehearsalBadge: 'リハーサル',
    rehearsalNote: 'これはリハーサルであり、本番環境の修復ではありません。ここでゲート、通知、監査の経路が機能することを証明するものです。実際のインシデントが修正されたことの証拠ではありません。',
    runButton: 'リハーサルを実行',
    runningButton: '3 つのカテゴリすべてを実行中…',
    runningNote: '実際の通知を送信しています。数秒かかります。',
    requestFailed: 'リクエストに失敗しました',
    didNotComplete: 'リクエストは完了しませんでした',
    notRun: '未実行',
    passed: '合格',
    failed: '失敗',
    pass: '合格',
    fail: '失敗',
    auditEvents: '監査イベント',
    notifications: '送信済み通知',
    ranAtLabel: '実行時刻',
    drillHeading: '訓練インシデントを発生させる',
    drillIntro: '監視アラートと同じ経路で合成インシデントを送信します：署名付き Webhook、認証、重複排除、保存、トリアージ、ポリシーエンジン。スタブ化も迂回も一切ありません。',
    drillBadge: 'ドリル',
    drillNote: '修復は実行されません。このデプロイには実行ステップランナーが設定されていないため、実行は未解決のまま終了し、行われていない修正を報告する代わりにその理由を記録します。',
    drillButton: '訓練インシデントを発生させる',
    drillRunningButton: '配信中…',
    drillRunningNote: 'インシデントを認証、保存、診断しています。',
    deliveryLabel: '配信',
    incidentLabel: 'インシデント',
    outcomeLabel: '結果',
    licenceLabel: 'ライセンス',
    licenceOk: 'インストール済み',
    licenceMissing: '未インストール — 診断は拒否されます',
  },
  ko: {
    heading: '지금 리허설 실행',
    intro: '이 배포의 실제 연결을 대상으로 위험 범주별로 리허설 인시던트를 하나씩 실행합니다. 안전한 단계는 실행되고, 중대한 단계는 반드시 일시 중지되며, 승인자는 실제 채널을 통해 알림을 받고 감사 추적이 생성됩니다. 중대한 작업은 실행될 수 없으며, 위험한 단계는 반드시 일시 중지되어야 합니다.',
    rehearsalBadge: '리허설',
    rehearsalNote: '이것은 리허설이며 프로덕션 복구가 아닙니다. 여기서 승인 게이트, 알림, 감사 경로가 작동함을 증명합니다. 실제 인시던트가 수정되었다는 증거는 아닙니다.',
    runButton: '리허설 실행',
    runningButton: '세 가지 카테고리 모두 실행 중…',
    runningNote: '실제 알림을 전송하는 중입니다. 몇 초 정도 걸립니다.',
    requestFailed: '요청 실패',
    didNotComplete: '요청이 완료되지 않았습니다',
    notRun: '실행 안 됨',
    passed: '통과',
    failed: '실패',
    pass: '통과',
    fail: '실패',
    auditEvents: '감사 이벤트',
    notifications: '전송된 알림',
    ranAtLabel: '실행 시각',
    drillHeading: '훈련 인시던트 발생시키기',
    drillIntro: '모니터링 알림과 동일한 경로로 합성 인시던트를 전송합니다. 서명된 웹훅, 인증, 중복 제거, 저장, 분류 및 정책 엔진을 거칩니다. 아무것도 스텁 처리되거나 우회되지 않습니다.',
    drillBadge: '드릴',
    drillNote: '복구는 실행되지 않습니다. 이 배포에는 실행 단계 러너가 구성되어 있지 않으므로, 실행은 미해결 상태로 종료되며 일어나지 않은 수정을 주장하는 대신 그 이유를 기록합니다.',
    drillButton: '훈련 인시던트 발생',
    drillRunningButton: '전달 중…',
    drillRunningNote: '인시던트를 인증, 저장 및 진단하고 있습니다.',
    deliveryLabel: '전달',
    incidentLabel: '인시던트',
    outcomeLabel: '결과',
    licenceLabel: '라이선스',
    licenceOk: '설치됨',
    licenceMissing: '설치되지 않음 — 진단이 거부됨',
  },
  ar: {
    heading: 'تشغيل تجربة الآن',
    intro: 'يُشغّل حادثة تجريبية واحدة لكل فئة مخاطر على التوصيلات الحقيقية لهذا النشر. تُنفَّذ خطوة آمنة، ويجب أن تتوقف خطوة ذات عواقب مؤقتًا، ويُخطَر المعتمِد عبر القناة الحقيقية، ويُنشأ سجل تدقيق. لا يمكن تنفيذ أي شيء ذي عواقب، إذ يجب أن تتوقف الخطوة الخطرة مؤقتًا.',
    rehearsalBadge: 'البروفة',
    rehearsalNote: 'هذه بروفة وليست إصلاحًا في بيئة الإنتاج. وهي تُثبت أن مسار التحكم والإشعار والتدقيق يعمل هنا. وليست دليلًا على إصلاح حادث حقيقي.',
    runButton: 'تشغيل التدريب',
    runningButton: 'جارٍ تشغيل الفئات الثلاث…',
    runningNote: 'يجري إرسال إشعارات حقيقية. يستغرق ذلك بضع ثوانٍ.',
    requestFailed: 'فشل الطلب',
    didNotComplete: 'لم يكتمل الطلب',
    notRun: 'لم يُشغَّل',
    passed: 'ناجح',
    failed: 'فشل',
    pass: 'ناجح',
    fail: 'فشل',
    auditEvents: 'أحداث التدقيق',
    notifications: 'الإشعارات المرسلة',
    ranAtLabel: 'التشغيل في',
    drillHeading: 'إطلاق حادثة تدريبية',
    drillIntro: 'يرسل حادثة اصطناعية عبر المسار نفسه الذي يسلكه تنبيه المراقبة: خطاف ويب موقّع، والمصادقة، وإزالة التكرار، والتخزين، والفرز، ومحرك السياسات. لا شيء مُحاكى ولا شيء يُتجاوَز.',
    drillBadge: 'تدريب',
    drillNote: 'لا يتم تنفيذ أي إصلاح. لا يُهيّئ هذا النشر أي مشغّل لخطوات التنفيذ، لذا ينتهي التشغيل دون حل ويُسجّل السبب، بدلًا من ادعاء إصلاح لم يحدث.',
    drillButton: 'إطلاق حادثة تدريبية',
    drillRunningButton: 'جارٍ التسليم…',
    drillRunningNote: 'تجري مصادقة الحادث وتخزينه وتشخيصه.',
    deliveryLabel: 'التسليم',
    incidentLabel: 'حادثة',
    outcomeLabel: 'النتيجة',
    licenceLabel: 'الترخيص',
    licenceOk: 'مثبَّت',
    licenceMissing: 'غير مثبّت — يرفض التشخيص',
  },
}

export default function DemoRehearsal({ lang }: { lang: Language }) {
  const copy = COPY[lang] ?? COPY.en

  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [record, setRecord] = useState<AcceptanceRecord | null>(null)
  const [error, setError] = useState('')

  const [drillState, setDrillState] = useState<'idle' | 'running' | 'done'>('idle')
  const [drill, setDrill] = useState<DrillRecord | null>(null)
  const [drillError, setDrillError] = useState('')

  // Publishing turns a run into a link a prospect can open without an account. It is always
  // an explicit press: nothing is published as a side effect of running a rehearsal or drill.
  const pub = DEMO_PUBLISH_COPY[(lang as DemoPublishLanguage)] ?? DEMO_PUBLISH_COPY.en
  const [shared, setShared] = useState<Record<string, { shareUrl: string; expiresAt?: string; recordId: string } | null>>({})
  const [publishBusy, setPublishBusy] = useState('')
  const [publishError, setPublishError] = useState('')
  const [revokedKinds, setRevokedKinds] = useState<Record<string, boolean>>({})

  async function publish(kind: 'rehearsal' | 'drill', payload: unknown) {
    if (publishBusy) return
    setPublishBusy(kind)
    setPublishError('')
    try {
      const response = await fetch('/api/supervisor/demo/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, record: payload }),
      })
      const result = await response.json()
      if (!result?.ok) {
        setPublishError(String(result?.error || pub.failed))
        return
      }
      setShared(current => ({ ...current, [kind]: { shareUrl: result.shareUrl, expiresAt: result.expiresAt, recordId: result.recordId } }))
      setRevokedKinds(current => ({ ...current, [kind]: false }))
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : pub.failed)
    } finally {
      setPublishBusy('')
    }
  }

  async function revoke(kind: 'rehearsal' | 'drill') {
    const entry = shared[kind]
    if (!entry || publishBusy) return
    setPublishBusy(`revoke:${kind}`)
    setPublishError('')
    try {
      const response = await fetch(`/api/supervisor/demo/publish?recordId=${encodeURIComponent(entry.recordId)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!result?.ok) {
        setPublishError(String(result?.error || pub.failed))
        return
      }
      setRevokedKinds(current => ({ ...current, [kind]: true }))
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : pub.failed)
    } finally {
      setPublishBusy('')
    }
  }

  function publishPanel(kind: 'rehearsal' | 'drill', payload: unknown) {
    const entry = shared[kind]
    const isRevoked = revokedKinds[kind] === true
    return (
      <section style={subcard}>
        <p style={muted}>{pub.publishNote}</p>
        <button
          type="button"
          onClick={() => publish(kind, payload)}
          disabled={publishBusy !== ''}
          style={{ ...button, cursor: publishBusy !== '' ? 'wait' : 'pointer' }}
        >
          {publishBusy === kind ? pub.publishing : pub.publishButton}
        </button>
        {publishError ? <p role="alert" style={alert}>{publishError}</p> : null}
        {entry ? (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '0 0 6px' }}>{pub.linkTitle}</h4>
            <input readOnly value={entry.shareUrl} style={linkBox} />
            <p style={warn}>{pub.publicWarning}</p>
            <p style={muted}>{pub.linkHint}</p>
            {entry.expiresAt ? (
              <p style={muted}>
                {pub.expiresLabel}: {entry.expiresAt}
              </p>
            ) : null}
            {isRevoked ? (
              <p style={warn}>{pub.revoked}</p>
            ) : (
              <button
                type="button"
                onClick={() => revoke(kind)}
                disabled={publishBusy !== ''}
                style={{ ...button, background: 'transparent', color: '#ffb3c1', border: '1px solid rgba(255,107,107,.5)' }}
              >
                {publishBusy === `revoke:${kind}` ? pub.revoking : pub.revokeButton}
              </button>
            )}
          </div>
        ) : null}
      </section>
    )
  }

  async function run() {
    if (state === 'running') return
    setState('running')
    setError('')
    setRecord(null)
    try {
      const response = await fetch('/api/autonomous-supervisor/acceptance', { method: 'POST' })
      const payload = (await response.json()) as AcceptanceRecord
      setRecord(payload)
      // A 409 is a real answer — a failed check, or a host context that could not be built.
      // Only a missing payload is a transport problem.
      if (!response.ok && !payload) setError(`${copy.requestFailed} (${response.status})`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.didNotComplete)
    } finally {
      setState('done')
    }
  }

  async function raiseDrill() {
    if (drillState === 'running') return
    setDrillState('running')
    setDrillError('')
    setDrill(null)
    try {
      const response = await fetch('/api/supervisor/demo/incident', { method: 'POST' })
      const payload = (await response.json()) as DrillRecord
      setDrill(payload)
      if (!response.ok && !payload) setDrillError(`${copy.requestFailed} (${response.status})`)
    } catch (cause) {
      setDrillError(cause instanceof Error ? cause.message : copy.didNotComplete)
    } finally {
      setDrillState('done')
    }
  }

  const didPass = record?.passed === true
  const licenceOk = drill?.licence?.configured === true

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={card}>
        <div style={badgeRow}>
          <span style={badge}>{copy.rehearsalBadge}</span>
        </div>
        <h2 style={{ margin: '8px 0' }}>{copy.heading}</h2>
        <p style={muted}>{copy.intro}</p>
        <p style={warn}>{copy.rehearsalNote}</p>

        <button type="button" onClick={run} disabled={state === 'running'} style={{ ...button, cursor: state === 'running' ? 'wait' : 'pointer' }}>
          {state === 'running' ? copy.runningButton : copy.runButton}
        </button>
        {state === 'running' ? <p style={muted}>{copy.runningNote}</p> : null}
        {error ? <p role="alert" style={alert}>{error}</p> : null}

        {record?.error ? (
          <section style={{ ...subcard, borderColor: '#ffb020' }}>
            <h3 style={{ marginTop: 0, color: '#ffcf7a' }}>{copy.notRun}</h3>
            <p>{record.error}</p>
            {record.remedy ? <p style={muted}>{record.remedy}</p> : null}
          </section>
        ) : null}

        {record?.runs?.length ? (
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <section style={{ ...subcard, borderColor: didPass ? '#38f2a4' : '#ff5c7a' }}>
              <h3 style={{ marginTop: 0, color: didPass ? '#71ffc1' : '#ff8ca2' }}>{didPass ? copy.passed : copy.failed}</h3>
              {record.meaning ? <p>{record.meaning}</p> : null}
              {record.blocking?.length ? (
                <ul>
                  {record.blocking.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <p style={muted}>
                {copy.ranAtLabel} {record.ranAt}
              </p>
            </section>

            {record.runs.map(item => (
              <section key={item.category} style={subcard}>
                <h3 style={{ marginTop: 0 }}>{item.category}</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                  {item.checks.map(check => (
                    <li key={check.id}>
                      <strong style={{ color: check.passed ? '#71ffc1' : '#ff8ca2' }}>{check.passed ? copy.pass : copy.fail}</strong>{' '}
                      {check.title}
                      <div style={muted}>{check.detail}</div>
                    </li>
                  ))}
                </ul>
                <p style={muted}>
                  {copy.auditEvents}: {item.auditEventTypes.join(', ')}
                </p>
                {typeof item.notificationCount === 'number' ? (
                  <p style={muted}>
                    {copy.notifications}: {item.notificationCount}
                  </p>
                ) : null}
              </section>
            ))}
            {publishPanel('rehearsal', record)}
          </div>
        ) : null}
      </section>

      <section style={card}>
        <div style={badgeRow}>
          <span style={badge}>{copy.drillBadge}</span>
        </div>
        <h2 style={{ margin: '8px 0' }}>{copy.drillHeading}</h2>
        <p style={muted}>{copy.drillIntro}</p>
        <p style={warn}>{copy.drillNote}</p>

        <button type="button" onClick={raiseDrill} disabled={drillState === 'running'} style={{ ...button, cursor: drillState === 'running' ? 'wait' : 'pointer' }}>
          {drillState === 'running' ? copy.drillRunningButton : copy.drillButton}
        </button>
        {drillState === 'running' ? <p style={muted}>{copy.drillRunningNote}</p> : null}
        {drillError ? <p role="alert" style={alert}>{drillError}</p> : null}

        {drill?.error ? (
          <section style={{ ...subcard, borderColor: '#ffb020' }}>
            <h3 style={{ marginTop: 0, color: '#ffcf7a' }}>{copy.notRun}</h3>
            <p>{drill.error}</p>
            {drill.remedy ? <p style={muted}>{drill.remedy}</p> : null}
          </section>
        ) : null}

        {drill?.delivery ? (
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <section style={subcard}>
              <dl style={grid}>
                <div>
                  <dt style={muted}>{copy.deliveryLabel}</dt>
                  <dd style={dd}>{drill.delivery.status}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.incidentLabel}</dt>
                  <dd style={dd}>{drill.delivery.incidentId}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.outcomeLabel}</dt>
                  <dd style={dd}>{drill.delivery.outcome}</dd>
                </div>
                <div>
                  <dt style={muted}>{copy.licenceLabel}</dt>
                  <dd style={{ ...dd, color: licenceOk ? '#71ffc1' : '#ffd8a8' }}>
                    {licenceOk ? copy.licenceOk : `${copy.licenceMissing} (${drill.licence?.reason})`}
                  </dd>
                </div>
              </dl>
              {drill.delivery.reason ? <p style={muted}>{drill.delivery.reason}</p> : null}
            </section>

            {drill.auditEventTypes?.length ? (
              <section style={subcard}>
                <p style={muted}>
                  {copy.auditEvents}: {drill.auditEventTypes.join(', ')}
                </p>
              </section>
            ) : null}

            {drill.meaning ? <p style={muted}>{drill.meaning}</p> : null}
            <p style={muted}>
              {copy.ranAtLabel} {drill.ranAt}
            </p>
            {publishPanel('drill', drill)}
          </div>
        ) : null}
      </section>
    </div>
  )
}

const card = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 18, background: 'rgba(0,0,0,.24)' }
const subcard = { border: '1px solid rgba(26,240,255,.2)', borderRadius: 14, padding: 12, background: 'rgba(26,240,255,.06)', marginTop: 12 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }
const dd = { margin: 0, wordBreak: 'break-word' as const, fontWeight: 700 }
const badgeRow = { display: 'flex', gap: 8, flexWrap: 'wrap' as const }
const badge = { border: '1px solid rgba(245,196,81,.6)', borderRadius: 999, padding: '6px 12px', color: '#f5c451', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' as const }
const button = { border: 0, borderRadius: 12, padding: '14px 20px', fontWeight: 900, fontSize: 15, color: '#07111f', background: '#f5c451' }
const linkBox = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.16)', background: '#07111f', color: '#c3ccdf', fontFamily: 'ui-monospace, monospace', fontSize: 12, boxSizing: 'border-box' as const }
const muted = { color: 'rgba(255,255,255,.68)' }
const warn = { color: '#ffd8a8', fontWeight: 700 }
const alert = { color: '#ffb3c1', fontWeight: 700 }
