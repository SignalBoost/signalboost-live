// saas/app/dashboard/supervisor/demo/page.tsx
//
// THE DEMO PAGE — one screen a prospect can watch.
//
// It invents nothing. Every value on this page is read from the same
// SupabaseVercelHealthStore the operator console reads, for a real repair run against
// this deployment's own production. The page's only job is to put those values in the
// order the product actually works in, with a sentence of context each, so someone who
// has never seen the console can follow it.
//
// WHEN THERE IS NOTHING TO SHOW IT SAYS SO. A demo that fabricates a run to look good
// is the one thing that cannot be allowed here: the buyer is being asked to trust an
// audit trail, and a staged trail poisons the whole proposition. No runs means an empty
// state and an instruction for how to produce one.
//
// The licence state is shown deliberately. An unlicensed deployment refuses to plan or
// dispatch, and a prospect watching a refusal should be told that is the licence working
// rather than the product failing.

import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import DemoRehearsal from '@/components/supervisor/DemoRehearsal'
import { DEMO_STAGE_COPY, type DemoStageLanguage } from '@/lib/i18n/demoStageCopy'
import { SupabaseVercelHealthStore } from '@/lib/supervisor/providers/vercel'
import { getSupervisorEntitlement } from '@/self-healing-host/supervisor-entitlement'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import { uiText } from '@/lib/i18n/uiText'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

type DemoCopy = {
  kicker: string
  title: string
  subtitle: string
  adminOnly: string
  licenceInstalled: string
  licenceMissing: string
  licenceNote: string
  productionTitle: string
  productionNote: string
  emptyTitle: string
  emptyBody: string
  runLabel: string
  stageLabels: string[]
  stageBodies: string[]
  fields: Record<string, string>
  none: string
  auditTitle: string
  auditNote: string
  evidenceTitle: string
  closing: string
}

const COPY: Record<Language, DemoCopy> = {
  en: {
    kicker: uiText('generatedUi.u_1b0744fbc9a1e11e'),
    title: uiText('generatedUi.u_31d02dcac4164cd3'),
    subtitle: uiText('generatedUi.u_690951f895636bbd'),
    adminOnly: uiText('generatedUi.u_f979b0fab059cfcb'),
    licenceInstalled: uiText('generatedUi.u_7904bbe0a83ed7fe'),
    licenceMissing: uiText('generatedUi.u_9902b165f11ce888'),
    licenceNote: uiText('generatedUi.u_7b030b94cd49f490'),
    productionTitle: uiText('generatedUi.u_9c7748eeb286ad16'),
    productionNote: uiText('generatedUi.u_17def0152fc479ad'),
    emptyTitle: uiText('generatedUi.u_de103e60b80d6627'),
    emptyBody: uiText('generatedUi.u_666c1060da81decc'),
    runLabel: uiText('generatedUi.u_00d60e31a4e6b834'),
    stageLabels: [uiText('generatedUi.u_756a8ba97dce249a'), uiText('generatedUi.u_f3160cd7d6b6786e'), uiText('generatedUi.u_ad91f5e4de4b84f1'), uiText('generatedUi.u_3aa8b683ebf3703c'), uiText('generatedUi.u_4f7838402f37674e'), uiText('generatedUi.u_295f5bbed1e0e3a9')],
    stageBodies: [
      uiText('generatedUi.u_2e3d401b567e5d9d'),
      uiText('generatedUi.u_1edc6a0edf627cf4'),
      uiText('generatedUi.u_7fce5da26ef165c5'),
      uiText('generatedUi.u_e12c0a488295a343'),
      uiText('generatedUi.u_f370cea58f9ba7d9'),
      uiText('generatedUi.u_1b789a1739a2a5b5'),
    ],
    fields: {
      status: "Status", project: uiText('generatedUi.u_9859597853197476'), environment: uiText('generatedUi.u_9e471951a1b4106e'), deployment: uiText('generatedUi.u_870a8ffd98f4f2bd'),
      errorCode: uiText('generatedUi.u_0570b384c3cecf81'), severity: uiText('generatedUi.u_5e9f98120dbe5682'), plan: uiText('generatedUi.u_fa8ed0bdabdd6bcb'), channel: "Channel",
      approvedSteps: uiText('generatedUi.u_b753fe0c7acec513'), verification: uiText('generatedUi.u_7140f4f19dec5259'), comparison: uiText('generatedUi.u_571527339d0e3e34'),
    },
    none: uiText('generatedUi.u_140bedbf9c3f6d56'),
    auditTitle: uiText('generatedUi.u_c1ada08ce13857e4'),
    auditNote: uiText('generatedUi.u_1e8771919b3b346d'),
    evidenceTitle: uiText('generatedUi.u_03867aea70acaf4c'),
    closing: uiText('generatedUi.u_305caed6e5caffa8'),
  },
  es: {
    kicker: 'Ejecución real',
    title: 'Supervisor de Autorreparación',
    subtitle: 'Una reparación real en este despliegue. Cada valor procede del registro de auditoría, no está preparado para esta página.',
    adminOnly: 'Esta página está disponible para administradores.',
    licenceInstalled: 'Licencia instalada: planificación y ejecución habilitadas.',
    licenceMissing: 'Sin licencia instalada. Los incidentes se reciben y registran, pero no se diagnostican.',
    licenceNote: 'La comprobación falla de forma cerrada por diseño. Un despliegue sin licencia no se comporta discretamente como uno con licencia.',
    productionTitle: 'Historial de reparaciones en producción',
    productionNote: 'A continuación se muestra una reparación real en la producción de este despliegue. A diferencia del ensayo anterior, no puede activarse a voluntad: solo aparece tras detectarse y procesarse un fallo genuino.',
    emptyTitle: 'Todavía no se ha observado ninguna reparación',
    emptyBody: 'Aquí no se muestra nada hasta que se detecte y procese un fallo real de despliegue. Esta página no inventará uno.',
    runLabel: 'Ejecución',
    stageLabels: ['Detectado', 'Diagnosticado', 'Con aprobación', 'Ejecutado', 'Verificado', 'Auditado'],
    stageBodies: [
      'Se observó un fallo en producción sin que nadie lo reportara.',
      'El supervisor generó un plan de reparación con pasos de verificación, no una suposición.',
      'Los pasos consecuentes se detienen ante una persona designada. No existe edición en la que no lo hagan.',
      'Solo se ejecutaron los pasos que una persona aprobó.',
      'El resultado se comprobó contra los pasos de verificación del plan, no se dio por supuesto.',
      'Cada paso anterior dejó un registro. Este es el rastro que recibe su SIEM.',
    ],
    fields: {
      status: 'Estado', project: 'Proyecto', environment: 'Entorno', deployment: 'Despliegue',
      errorCode: 'Código de error', severity: 'Severidad', plan: 'Plan', channel: 'Canal',
      approvedSteps: 'Pasos aprobados', verification: 'Verificación', comparison: 'Comparación',
    },
    none: 'ninguno',
    auditTitle: 'Registro de auditoría',
    auditNote: 'En el orden en que ocurrió. Es una vista de conveniencia; el registro de referencia es el que llega a su SIEM.',
    evidenceTitle: 'Evidencia',
    closing: 'Nada de esta página requirió que alguien estuviera vigilando cuando ocurrió el fallo.',
  },
  pt: {
    kicker: 'Execução real',
    title: 'Supervisor de Autorreparação',
    subtitle: 'Uma reparação real neste ambiente. Cada valor vem do registo de auditoria, não foi preparado para esta página.',
    adminOnly: 'Esta página está disponível para administradores.',
    licenceInstalled: 'Licença instalada — planeamento e execução ativos.',
    licenceMissing: 'Sem licença instalada. Os incidentes são recebidos e registados, mas não diagnosticados.',
    licenceNote: 'A verificação falha de forma fechada por desenho. Um ambiente sem licença não se comporta discretamente como um licenciado.',
    productionTitle: 'Histórico de reparações em produção',
    productionNote: 'Abaixo está uma reparação real na produção deste ambiente. Ao contrário do ensaio acima, não pode ser acionada a pedido: só aparece depois de uma falha genuína ser detetada e processada.',
    emptyTitle: 'Ainda não foi observada nenhuma reparação',
    emptyBody: 'Nada é mostrado aqui até que uma falha real de implantação seja detetada e processada. Esta página não inventará uma.',
    runLabel: 'Execução',
    stageLabels: ['Detetado', 'Diagnosticado', 'Com aprovação', 'Executado', 'Verificado', 'Auditado'],
    stageBodies: [
      'Uma falha foi observada em produção sem que ninguém a reportasse.',
      'O supervisor produziu um plano de reparação com passos de verificação, não um palpite.',
      'Passos consequentes param perante uma pessoa designada. Não há edição em que não parem.',
      'Apenas os passos aprovados por uma pessoa foram executados.',
      'O resultado foi verificado face aos passos do plano, não presumido.',
      'Cada passo acima deixou registo. Este é o rasto que o seu SIEM recebe.',
    ],
    fields: {
      status: 'Estado', project: 'Projeto', environment: 'Ambiente', deployment: 'Implantação',
      errorCode: 'Código de erro', severity: 'Severidade', plan: 'Plano', channel: 'Canal',
      approvedSteps: 'Passos aprovados', verification: 'Verificação', comparison: 'Comparação',
    },
    none: 'nenhum',
    auditTitle: 'Registo de auditoria',
    auditNote: 'Pela ordem em que aconteceu. É uma vista de conveniência; o registo de referência é o que chega ao seu SIEM.',
    evidenceTitle: 'Evidência',
    closing: 'Nada nesta página exigiu que alguém estivesse a observar quando a falha ocorreu.',
  },
  pl: {
    kicker: 'Rzeczywisty przebieg',
    title: 'Nadzorca Samonaprawy',
    subtitle: 'Rzeczywista naprawa w tym wdrożeniu. Każda wartość pochodzi z rejestru audytu, nie została przygotowana na potrzeby tej strony.',
    adminOnly: 'Ta strona jest dostępna dla administratorów.',
    licenceInstalled: 'Licencja zainstalowana — planowanie i wykonanie są włączone.',
    licenceMissing: 'Brak zainstalowanej licencji. Incydenty są odbierane i zapisywane, ale nie diagnozowane.',
    licenceNote: 'Kontrola domyślnie odmawia. Wdrożenie bez licencji nie zachowuje się po cichu jak licencjonowane.',
    productionTitle: 'Historia napraw na produkcji',
    productionNote: 'Poniżej znajduje się rzeczywista naprawa na produkcji tego wdrożenia. W odróżnieniu od powyższej próby nie da się jej uruchomić na żądanie — pojawia się dopiero po wykryciu i przetworzeniu prawdziwej awarii.',
    emptyTitle: 'Nie zaobserwowano jeszcze żadnej naprawy',
    emptyBody: 'Nic nie zostanie tu pokazane, dopóki nie zostanie wykryta i przetworzona rzeczywista awaria wdrożenia. Ta strona jej nie wymyśli.',
    runLabel: 'Przebieg',
    stageLabels: ['Wykryto', 'Zdiagnozowano', 'Zatwierdzenie', 'Wykonano', 'Zweryfikowano', 'Zapisano'],
    stageBodies: [
      'Awaria została zauważona na produkcji, zanim ktokolwiek ją zgłosił.',
      'Nadzorca przygotował plan naprawy z krokami weryfikacji, a nie domysł.',
      'Kroki o istotnych skutkach zatrzymują się przed wskazaną osobą. Nie ma edycji, w której jest inaczej.',
      'Wykonano wyłącznie kroki zatwierdzone przez człowieka.',
      'Wynik sprawdzono względem kroków weryfikacji z planu, a nie założono.',
      'Każdy powyższy krok zostawił zapis. To ślad, który trafia do Twojego SIEM.',
    ],
    fields: {
      status: 'Stan', project: 'Projekt', environment: 'Środowisko', deployment: 'Wdrożenie',
      errorCode: 'Kod błędu', severity: 'Waga', plan: 'Plan', channel: 'Kanał',
      approvedSteps: 'Zatwierdzone kroki', verification: 'Weryfikacja', comparison: 'Porównanie',
    },
    none: 'brak',
    auditTitle: 'Ślad audytowy',
    auditNote: 'W kolejności zdarzeń. To widok pomocniczy; zapisem wiążącym jest ten, który trafia do Twojego SIEM.',
    evidenceTitle: 'Dowody',
    closing: 'Nic na tej stronie nie wymagało, by ktoś patrzył w chwili awarii.',
  },
  ru: {
    kicker: 'Реальный запуск',
    title: 'Супервизор самовосстановления',
    subtitle: 'Реальное восстановление в этом развёртывании. Каждое значение взято из журнала аудита, а не подготовлено для этой страницы.',
    adminOnly: 'Эта страница доступна администраторам.',
    licenceInstalled: 'Лицензия установлена — планирование и выполнение включены.',
    licenceMissing: 'Лицензия не установлена. Инциденты принимаются и записываются, но не диагностируются.',
    licenceNote: 'Проверка по умолчанию запрещает. Развёртывание без лицензии не ведёт себя незаметно так же, как лицензированное.',
    productionTitle: 'История восстановлений в продакшене',
    productionNote: 'Ниже — реальное восстановление в продакшене этого развёртывания. В отличие от репетиции выше, его нельзя запустить по требованию: оно появляется только после того, как настоящий сбой был обнаружен и обработан.',
    emptyTitle: 'Восстановлений пока не наблюдалось',
    emptyBody: 'Здесь ничего не отображается, пока не обнаружен и не обработан реальный сбой развёртывания. Эта страница его не выдумает.',
    runLabel: 'Запуск',
    stageLabels: ['Обнаружено', 'Диагностировано', 'Согласование', 'Выполнено', 'Проверено', 'Зафиксировано'],
    stageBodies: [
      'Сбой в продакшене был замечен до того, как о нём кто-либо сообщил.',
      'Супервизор построил план восстановления с шагами проверки, а не догадку.',
      'Значимые шаги останавливаются перед назначенным человеком. Нет редакции, где это не так.',
      'Выполнены только те шаги, которые одобрил человек.',
      'Результат сверен с шагами проверки из плана, а не принят на веру.',
      'Каждый шаг выше оставил запись. Это тот след, который получает ваша SIEM.',
    ],
    fields: {
      status: 'Статус', project: 'Проект', environment: 'Среда', deployment: 'Развёртывание',
      errorCode: 'Код ошибки', severity: 'Важность', plan: 'План', channel: 'Канал',
      approvedSteps: 'Одобренные шаги', verification: 'Проверка', comparison: 'Сравнение',
    },
    none: 'нет',
    auditTitle: 'Журнал аудита',
    auditNote: 'В порядке событий. Это вспомогательный вид; учётной записью является та, что приходит в вашу SIEM.',
    evidenceTitle: 'Свидетельства',
    closing: 'Ничто на этой странице не потребовало, чтобы кто-то наблюдал в момент сбоя.',
  },
  de: {
    kicker: 'Live-Lauf',
    title: 'Selbstheilender Supervisor',
    subtitle: 'Ein echter Reparaturlauf für dieses Deployment. Jeder Wert unten wird aus dem Audit-Speicher gelesen und nicht für diese Seite inszeniert.',
    adminOnly: 'Diese Seite ist für Administratoren verfügbar.',
    licenceInstalled: 'Lizenz installiert – Planung und Ausführung sind aktiviert.',
    licenceMissing: 'Keine Lizenz installiert. Vorfälle werden empfangen und erfasst, aber nicht diagnostiziert.',
    licenceNote: 'Die Sperre ist bewusst fail-closed ausgelegt. Eine nicht lizenzierte Bereitstellung verhält sich nicht stillschweigend wie eine lizenzierte.',
    productionTitle: 'Reparaturverlauf der Produktion',
    productionNote: 'Unten sehen Sie einen echten Reparaturlauf gegen die eigene Produktion dieser Bereitstellung. Anders als die Probe oben kann er nicht bei Bedarf ausgelöst werden – er erscheint erst, nachdem ein echter Fehler erkannt und verarbeitet wurde.',
    emptyTitle: 'Bisher wurde kein Reparaturlauf beobachtet',
    emptyBody: 'Hier wird nichts angezeigt, bis ein echter Deployment-Fehler erkannt und verarbeitet wurde. Diese Seite erfindet keinen.',
    runLabel: 'Ausführen',
    stageLabels: ['Erkannt', 'Diagnostiziert', 'Zugangsbeschränkt', 'Ausgeführt', 'Verifiziert', 'Geprüft'],
    stageBodies: [
      'In der Produktion wurde ein Fehler festgestellt, ohne dass ihn jemand gemeldet hat.',
      'Der Supervisor hat statt einer Vermutung einen Reparaturplan mit Verifizierungsschritten erstellt.',
      'Folgenreiche Schritte halten für eine namentlich benannte Person an. Es gibt keine Edition, in der das nicht so ist.',
      'Nur die von einem Menschen genehmigten Schritte wurden ausgeführt.',
      'Das Ergebnis wurde anhand der Verifizierungsschritte im Plan geprüft, nicht angenommen.',
      'Jeder Schritt oben hat einen Eintrag hinterlassen. Dies ist die Spur, die Ihr SIEM erhält.',
    ],
    fields: {
      status: "Status", project: 'Projekt', environment: 'Umgebung', deployment: 'Deployment',
      errorCode: 'Fehlercode', severity: 'Schweregrad', plan: 'Plan', channel: "Kanal",
      approvedSteps: 'Genehmigte Schritte', verification: 'Verifizierung', comparison: 'Vergleich',
    },
    none: 'keine',
    auditTitle: 'Audit-Trail',
    auditNote: 'Chronologisch geordnet. Dies ist eine Komfortansicht; maßgeblich ist der Datensatz, der Ihr SIEM erreicht.',
    evidenceTitle: 'Nachweise',
    closing: 'Nichts auf dieser Seite erforderte, dass jemand zusah, als der Fehler auftrat.',
  },
  fr: {
    kicker: 'Exécution réelle',
    title: 'Superviseur d\'autoréparation',
    subtitle: 'Une véritable exécution de réparation sur ce déploiement. Chaque valeur ci-dessous est lue depuis le magasin d’audit, et non mise en scène pour cette page.',
    adminOnly: 'Cette page est réservée aux administrateurs.',
    licenceInstalled: 'Licence installée — la planification et l\'expédition sont activées.',
    licenceMissing: 'Aucune licence installée. Les incidents sont reçus et enregistrés, mais pas diagnostiqués.',
    licenceNote: 'Le verrou est fermé par défaut en cas d\'échec, par conception. Un déploiement sans licence ne se comporte pas discrètement comme un déploiement sous licence.',
    productionTitle: 'Historique des réparations en production',
    productionNote: 'Ci-dessous figure une véritable réparation exécutée sur la production même de ce déploiement. Contrairement à la répétition ci-dessus, elle ne peut pas être déclenchée à la demande : elle n’apparaît qu’après la détection et le traitement d’une véritable défaillance.',
    emptyTitle: 'Aucune exécution de réparation n’a encore été observée',
    emptyBody: 'Rien ne s’affiche ici tant qu’un véritable échec de déploiement n’a pas été détecté et traité. Cette page n’en inventera pas.',
    runLabel: 'Exécuter',
    stageLabels: ['Détecté', 'Diagnostiqué', 'Restreint', 'Exécuté', 'Vérifié', 'Audité'],
    stageBodies: [
      'Une défaillance a été observée en production sans que personne ne la signale.',
      'Le superviseur a produit un plan de réparation avec des étapes de vérification, plutôt qu’une supposition.',
      'Les étapes à fort impact s’arrêtent pour une personne nommément désignée. Aucune édition ne fait exception.',
      'Seules les étapes approuvées par un humain ont été exécutées.',
      'Le résultat a été vérifié par rapport aux étapes de vérification du plan, et non supposé.',
      'Chaque étape ci-dessus a laissé une trace. Voici la piste que reçoit votre SIEM.',
    ],
    fields: {
      status: "Statut", project: 'Projet', environment: 'Environnement', deployment: 'Déploiement',
      errorCode: 'Code d\'erreur', severity: 'Gravité', plan: 'Plan', channel: "Canal",
      approvedSteps: 'Étapes approuvées', verification: 'Vérification', comparison: 'Comparaison',
    },
    none: 'aucun',
    auditTitle: 'Piste d’audit',
    auditNote: 'Classé dans l’ordre des événements. Il s’agit d’une vue de commodité ; l’enregistrement de référence est celui qui parvient à votre SIEM.',
    evidenceTitle: 'Preuves',
    closing: 'Rien sur cette page n\'exigeait qu\'une personne soit présente au moment de la défaillance.',
  },
  it: {
    kicker: 'Esecuzione live',
    title: 'Supervisore di autoriparazione',
    subtitle: 'Un’esecuzione di riparazione reale su questo deployment. Ogni valore qui sotto viene letto dall’archivio di audit, non preparato per questa pagina.',
    adminOnly: 'Questa pagina è disponibile per gli amministratori.',
    licenceInstalled: 'Licenza installata — pianificazione e invio sono abilitati.',
    licenceMissing: 'Nessuna licenza installata. Gli incidenti vengono ricevuti e registrati, ma non diagnosticati.',
    licenceNote: 'Il gate è progettato per bloccare in caso di errore (fail-closed). Una distribuzione senza licenza non si comporta silenziosamente come una con licenza.',
    productionTitle: 'Cronologia delle riparazioni in produzione',
    productionNote: 'Qui sotto è riportata una vera riparazione eseguita sulla produzione stessa di questo deployment. A differenza della prova precedente, non può essere avviata su richiesta: compare solo dopo che un guasto reale è stato rilevato ed elaborato.',
    emptyTitle: 'Nessuna esecuzione di riparazione è stata ancora rilevata',
    emptyBody: 'Qui non viene mostrato nulla finché non viene rilevato ed elaborato un vero errore di deployment. Questa pagina non ne inventerà uno.',
    runLabel: 'Esegui',
    stageLabels: ['Rilevato', 'Diagnosticato', 'Con accesso limitato', 'Eseguito', 'Verificato', 'Sottoposto ad audit'],
    stageBodies: [
      'È stato osservato un errore in produzione senza che nessuno lo segnalasse.',
      'Il supervisore ha prodotto un piano di riparazione con passaggi di verifica, invece di un’ipotesi.',
      'I passaggi rilevanti si fermano per una persona designata. Non esiste un’edizione in cui non accada.',
      'Sono stati eseguiti solo i passaggi approvati da una persona.',
      'Il risultato è stato verificato rispetto ai passaggi di verifica del piano, non presunto.',
      'Ogni passaggio precedente ha lasciato un record. Questa è la traccia che riceve il tuo SIEM.',
    ],
    fields: {
      status: "Stato", project: 'Progetto', environment: 'Ambiente', deployment: 'Deployment',
      errorCode: 'Codice errore', severity: 'Gravità', plan: 'Piano', channel: "Canale",
      approvedSteps: 'Passaggi approvati', verification: 'Verifica', comparison: 'Confronto',
    },
    none: 'nessuno',
    auditTitle: 'Audit trail',
    auditNote: 'Ordinato come è avvenuto. Questa è una vista di comodo; il registro ufficiale è ciò che arriva al tuo SIEM.',
    evidenceTitle: 'Prove',
    closing: 'Nulla in questa pagina richiedeva che una persona stesse osservando quando si è verificato l\'errore.',
  },
  ja: {
    kicker: '本番実行',
    title: '自己修復スーパーバイザー',
    subtitle: 'このデプロイに対する実際の修復実行です。以下の値はすべて監査ストアから読み取られたもので、このページ用に用意されたものではありません。',
    adminOnly: 'このページは管理者が利用できます。',
    licenceInstalled: 'ライセンスがインストールされました — 計画とディスパッチが有効です。',
    licenceMissing: 'ライセンスがインストールされていません。インシデントは受信・記録されますが、診断はされません。',
    licenceNote: 'このゲートは設計上フェイルクローズです。ライセンスのないデプロイが、ライセンス付きのものと同じように黙って動作することはありません。',
    productionTitle: '本番環境の修復履歴',
    productionNote: '以下は、このデプロイ自身の本番環境に対して実行された実際の修復です。上記のリハーサルとは異なり、オンデマンドで起動することはできません。実際の障害が検出・処理された後にのみ表示されます。',
    emptyTitle: '修復の実行はまだ確認されていません',
    emptyBody: '実際のデプロイ失敗が検出・処理されるまで、ここには何も表示されません。このページが失敗を捏造することはありません。',
    runLabel: '実行',
    stageLabels: ['検出済み', '診断済み', '制限付き', '実行済み', '検証済み', '監査済み'],
    stageBodies: [
      '誰からも報告されることなく、本番環境で障害が検出されました。',
      'スーパーバイザーは推測ではなく、検証手順を含む修復計画を作成しました。',
      '重大なステップは、指名された担当者の判断のために停止します。そうならないエディションはありません。',
      '人が承認したステップのみが実行されました。',
      '結果は想定ではなく、プランの検証手順に照らして確認されました。',
      '上記の各ステップは記録を残しています。これが SIEM に送られる証跡です。',
    ],
    fields: {
      status: "ステータス", project: 'プロジェクト', environment: '環境', deployment: 'デプロイ',
      errorCode: 'エラーコード', severity: '重大度', plan: '計画', channel: "チャネル",
      approvedSteps: '承認済みステップ', verification: '検証', comparison: '比較',
    },
    none: 'なし',
    auditTitle: '監査証跡',
    auditNote: '発生順に並んでいます。これは便宜上のビューであり、正式な記録は SIEM に届くものです。',
    evidenceTitle: '証拠',
    closing: '障害発生時に誰かが監視している必要があった項目は、このページにはありません。',
  },
  ko: {
    kicker: '실제 실행',
    title: '자가 복구 슈퍼바이저',
    subtitle: '이 배포에 대한 실제 복구 실행입니다. 아래의 모든 값은 감사 저장소에서 읽어 온 것이며, 이 페이지를 위해 연출된 것이 아닙니다.',
    adminOnly: '이 페이지는 관리자가 사용할 수 있습니다.',
    licenceInstalled: '라이선스 설치됨 — 계획 및 디스패치가 활성화되었습니다.',
    licenceMissing: '설치된 라이선스가 없습니다. 인시던트는 수신 및 기록되지만 진단되지는 않습니다.',
    licenceNote: '이 게이트는 설계상 실패 시 차단(fail-closed)됩니다. 라이선스가 없는 배포는 라이선스가 있는 배포처럼 조용히 동작하지 않습니다.',
    productionTitle: '프로덕션 복구 기록',
    productionNote: '아래는 이 배포의 실제 프로덕션을 대상으로 한 실제 복구 실행입니다. 위의 리허설과 달리 필요할 때 실행할 수 없으며, 실제 장애가 감지되고 처리된 후에만 나타납니다.',
    emptyTitle: '아직 관찰된 복구 실행이 없습니다',
    emptyBody: '실제 배포 실패가 감지되고 처리될 때까지 여기에는 아무것도 표시되지 않습니다. 이 페이지는 실패를 지어내지 않습니다.',
    runLabel: '실행',
    stageLabels: ['감지됨', '진단됨', '제한됨', '실행됨', '인증됨', '감사 완료'],
    stageBodies: [
      '누구의 보고도 없이 프로덕션에서 장애가 감지되었습니다.',
      '감독자가 추측 대신 검증 단계가 포함된 복구 계획을 작성했습니다.',
      '중대한 단계는 지정된 담당자를 위해 멈춥니다. 그렇지 않은 에디션은 없습니다.',
      '사람이 승인한 단계만 수행되었습니다.',
      '결과는 추정이 아니라 계획의 검증 단계에 따라 확인되었습니다.',
      '위의 모든 단계는 기록을 남겼습니다. 이것이 SIEM이 수신하는 추적 기록입니다.',
    ],
    fields: {
      status: "상태", project: '프로젝트', environment: '환경', deployment: '배포',
      errorCode: '오류 코드', severity: '심각도', plan: '계획', channel: "채널",
      approvedSteps: '승인된 단계', verification: '인증', comparison: '비교',
    },
    none: '없음',
    auditTitle: '감사 추적',
    auditNote: '발생 순서대로 정렬되어 있습니다. 이는 편의용 보기이며, 공식 기록은 SIEM에 전달되는 내용입니다.',
    evidenceTitle: '증거',
    closing: '이 페이지의 어떤 항목도 장애 발생 시 사람이 지켜보고 있을 필요가 없었습니다.',
  },
  ar: {
    kicker: 'تشغيل مباشر',
    title: 'المشرف ذاتي الإصلاح',
    subtitle: 'عملية إصلاح حقيقية على هذا النشر. كل قيمة أدناه مقروءة من مخزن التدقيق، وليست مُعدّة لهذه الصفحة.',
    adminOnly: 'هذه الصفحة متاحة للمسؤولين.',
    licenceInstalled: 'تم تثبيت الترخيص — التخطيط والإرسال مفعّلان.',
    licenceMissing: 'لا يوجد ترخيص مثبّت. يتم استلام الحوادث وتسجيلها، لكن لا يتم تشخيصها.',
    licenceNote: 'البوابة مصمَّمة لتُغلق عند الفشل. لا يتصرف النشر غير المرخّص بصمت كما لو كان مرخّصًا.',
    productionTitle: 'سجل إصلاحات بيئة الإنتاج',
    productionNote: 'فيما يلي عملية إصلاح حقيقية على بيئة الإنتاج الخاصة بهذا النشر. وعلى خلاف التجربة أعلاه، لا يمكن تشغيلها عند الطلب، إذ لا تظهر إلا بعد اكتشاف عطل حقيقي ومعالجته.',
    emptyTitle: 'لم تُرصد أي عملية إصلاح بعد',
    emptyBody: 'لن يظهر شيء هنا حتى يتم اكتشاف فشل نشر حقيقي ومعالجته. لن تختلق هذه الصفحة واحدًا.',
    runLabel: 'تشغيل',
    stageLabels: ['تم الاكتشاف', 'تم التشخيص', 'مقيَّد', 'تم التنفيذ', 'تم التحقق', 'تم التدقيق'],
    stageBodies: [
      'تم رصد عطل في بيئة الإنتاج دون أن يبلّغ عنه أحد.',
      'أعدّ المشرف خطة إصلاح تتضمن خطوات تحقق، بدلًا من التخمين.',
      'تتوقف الخطوات ذات العواقب بانتظار شخص محدد بالاسم. ولا توجد أي إصدارة لا يحدث فيها ذلك.',
      'لم تُنفّذ إلا الخطوات التي وافق عليها إنسان.',
      'تم التحقق من النتيجة مقابل خطوات التحقق في الخطة، ولم يتم افتراضها.',
      'ترك كل خطوة أعلاه سجلًا. هذا هو المسار الذي يتلقاه نظام SIEM لديك.',
    ],
    fields: {
      status: "الحالة", project: 'المشروع', environment: 'البيئة', deployment: 'النشر',
      errorCode: 'رمز الخطأ', severity: 'الخطورة', plan: 'الخطة', channel: "القناة",
      approvedSteps: 'الخطوات المعتمدة', verification: 'التحقق', comparison: 'المقارنة',
    },
    none: 'لا شيء',
    auditTitle: 'سجل التدقيق',
    auditNote: 'مرتّبة حسب وقوعها. هذا عرض للتيسير فقط؛ أما السجل المعتمد فهو ما يصل إلى نظام SIEM لديك.',
    evidenceTitle: 'الأدلة',
    closing: 'لم يتطلب أي شيء في هذه الصفحة وجود شخص يراقب عند حدوث العطل.',
  },
}

function pickLanguage(value?: string): Language {
  const short = (value || 'en').slice(0, 2).toLowerCase()
  return (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'] as Language[]).includes(short as Language) ? (short as Language) : 'en'
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt style={muted}>{k}</dt>
      <dd style={{ margin: 0, wordBreak: 'break-word' }}>{v}</dd>
    </div>
  )
}

function Stage({ index, label, body, children }: { index: number; label: string; body: string; children?: ReactNode }) {
  return (
    <article style={card}>
      <div style={row}>
        <p style={kicker}>{`${index + 1} · ${label}`}</p>
      </div>
      <p style={muted}>{body}</p>
      {children}
    </article>
  )
}

export default async function SupervisorDemoPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const access = await getAccess()
  const lang = pickLanguage((await cookies()).get('sb_locale')?.value)
  const stageCopy = DEMO_STAGE_COPY[(lang as DemoStageLanguage)] ?? DEMO_STAGE_COPY.en
  const copy = COPY[lang]

  if (!access.isAdmin) {
    return (
      <main style={page}>
        <h1>{copy.title}</h1>
        <p>{copy.adminOnly}</p>
      </main>
    )
  }

  const entitlement = getSupervisorEntitlement()
  // Show the most recent run that actually FOUND something, falling back to the newest run
  // when there has never been an incident. Showing only the newest would mean a prospect
  // opening this page an hour after a real detection sees 'no incident detected' — the
  // healthy observation that happened to run last, instead of the evidence worth showing.
  const runs = await new SupabaseVercelHealthStore(getAdminSupabase()).listRuns({ limit: 25 }).catch(() => [])
  const run = runs.find(candidate => candidate.status !== 'healthy' && candidate.incident) ?? runs[0]
  const steps: string[] = (run?.approvedStepIds ?? []) as string[]
  const readOnlyRun = steps.length > 0 && steps.every(id => id.startsWith('read-') || id.startsWith('verify-'))

  return (
    <main style={page}>
      <section style={panel}>
        <p style={kicker}>{copy.kicker}</p>
        <h1>{copy.title}</h1>
        <p style={muted}>{copy.subtitle}</p>

        <p style={entitlement.configured ? notice : warn}>
          {entitlement.configured ? copy.licenceInstalled : `${copy.licenceMissing} (${entitlement.reason})`}
        </p>
        <p style={muted}>{copy.licenceNote}</p>

        <div style={{ marginTop: 20 }}>
          <DemoRehearsal lang={lang} />
        </div>

        <h2 style={{ marginBottom: 4, marginTop: 28 }}>{copy.productionTitle}</h2>
        <p style={muted}>{copy.productionNote}</p>

        {!run ? (
          <section style={card}>
            <h2>{copy.emptyTitle}</h2>
            <p style={muted}>{copy.emptyBody}</p>
          </section>
        ) : (
          <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
            <p style={muted}>
              {copy.runLabel} <code>{run.runId}</code>
              {readOnlyRun ? <span style={readOnlyBadge}>{stageCopy.readOnlyBadge}</span> : null}
            </p>

            <Stage index={0} label={copy.stageLabels[0]} body={copy.stageBodies[0]}>
              <dl style={grid}>
                <Field k={copy.fields.status} v={run.status} />
                <Field k={copy.fields.project} v={run.projectId} />
                <Field k={copy.fields.environment} v={run.environment} />
                <Field k={copy.fields.deployment} v={run.governance?.deploymentId || run.incident?.affectedResource || copy.none} />
                <Field k={copy.fields.errorCode} v={run.incident?.errorCode || copy.none} />
                <Field k={copy.fields.severity} v={run.incident?.severity || copy.none} />
              </dl>
            </Stage>

            <Stage index={1} label={copy.stageLabels[1]} body={copy.stageBodies[1]}>
              <dl style={grid}>
                <Field k={copy.fields.plan} v={run.plan?.planId || copy.none} />
                <Field k={copy.fields.channel} v={run.selectedChannel} />
              </dl>
            </Stage>

            <Stage index={2} label={copy.stageLabels[2]} body={readOnlyRun ? stageCopy.readOnlyGated : copy.stageBodies[2]}>
              <dl style={grid}>
                <Field k={copy.fields.approvedSteps} v={run.approvedStepIds.join(', ') || copy.none} />
              </dl>
            </Stage>

            <Stage index={3} label={copy.stageLabels[3]} body={readOnlyRun ? stageCopy.readOnlyExecuted : copy.stageBodies[3]}>
              <dl style={grid}>
                <Field k={copy.fields.comparison} v={run.comparisonStatus} />
              </dl>
            </Stage>

            <Stage index={4} label={copy.stageLabels[4]} body={copy.stageBodies[4]}>
              <dl style={grid}>
                <Field k={copy.fields.verification} v={run.verification.status} />
              </dl>
              <p style={muted}>{run.verification.summary}</p>
              {run.evidence.length > 0 && (
                <section style={subcard}>
                  <h3>{copy.evidenceTitle}</h3>
                  <ul>
                    {run.evidence.map(item => (
                      <li key={item.evidenceId}>
                        <strong>{item.kind}</strong> · <code>{item.stepId}</code> — {item.summary}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </Stage>

            <Stage index={5} label={copy.stageLabels[5]} body={copy.stageBodies[5]}>
              <h3>{copy.auditTitle}</h3>
              <ol>
                {run.auditEvents.map(event => (
                  <li key={event.eventId}>
                    <code>{event.eventType}</code> · {event.occurredAt}
                  </li>
                ))}
              </ol>
              <p style={muted}>{copy.auditNote}</p>
            </Stage>

            <p style={notice}>{copy.closing}</p>
          </div>
        )}
      </section>
    </main>
  )
}

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#07111f,#05070c)' }
const panel = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)' }
const card = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, padding: 18, background: 'rgba(0,0,0,.24)' }
const subcard = { border: '1px solid rgba(26,240,255,.2)', borderRadius: 14, padding: 12, background: 'rgba(26,240,255,.06)', marginTop: 12 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }
const row = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }
const muted = { color: 'rgba(255,255,255,.68)' }
const notice = { color: '#b8ffdd', fontWeight: 700 }
const warn = { color: '#ffd8a8', fontWeight: 700 }
const kicker = { color: '#1af0ff', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1 }
const readOnlyBadge = { marginInlineStart: 8, border: '1px solid rgba(26,240,255,.5)', borderRadius: 999, padding: '4px 10px', color: '#8be9ff', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1 }
