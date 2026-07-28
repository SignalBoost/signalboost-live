// saas/lib/i18n/demoShareCopy.ts
//
// Copy for the PUBLIC shared demo viewer (app/demo/supervisor).
//
// It lives here rather than in the page because the page-copy guard forbids user-facing
// English inside app/ and components/. Keeping the five languages together in one typed
// table also means a translator reviews them side by side.
//
// A NOTE ON TONE. This page is read by someone who has never met the product and has no
// account. Every string has to carry its own context — there is no operator beside them to
// explain what a rehearsal is or why nothing executed. The labels say what the reader is
// looking at, and just as importantly what it is not.

export type DemoShareLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type DemoShareCopy = {
  productName: string
  rehearsalBadge: string
  drillBadge: string
  rehearsalIntro: string
  drillIntro: string
  notProduction: string
  redactionNote: string
  publishedLabel: string
  expiresLabel: string
  invalidTitle: string
  invalidBody: string
  passed: string
  failed: string
  pass: string
  fail: string
  checksTitle: string
  auditTitle: string
  auditNote: string
  deliveryTitle: string
  deliveryLabel: string
  incidentLabel: string
  outcomeLabel: string
  auditEvents: string
  noExecution: string
  contactTitle: string
  contactBody: string
}

export const DEMO_SHARE_COPY: Record<DemoShareLanguage, DemoShareCopy> = {
  en: {
    productName: 'Self-Healing Supervisor',
    rehearsalBadge: 'Rehearsal',
    drillBadge: 'Drill',
    rehearsalIntro: 'A rehearsal incident was run once for each risk category against a real deployment. A safe step executed, a consequential step was required to stop and wait for a named human, that person was notified through a real channel, and an audit trail was produced.',
    drillIntro: 'A synthetic incident was sent through the same path a monitoring alert takes: signed webhook, authentication, deduplication, storage, triage and policy classification. Nothing was stubbed and nothing was bypassed.',
    notProduction: 'This is a demonstration, not a production repair. It shows that the approval, notification and audit path works. It is not evidence that a real incident was fixed.',
    redactionNote: 'Addresses, links, project and deployment identifiers were removed before this record was published.',
    publishedLabel: 'Published',
    expiresLabel: 'Link expires',
    invalidTitle: 'This link is not available',
    invalidBody: 'It may have expired, been revoked, or been copied incompletely. Ask the person who sent it for a current link.',
    passed: 'Passed',
    failed: 'Failed',
    pass: 'PASS',
    fail: 'FAIL',
    checksTitle: 'Checks',
    auditTitle: 'Audit trail',
    auditNote: 'In the order it happened. In a customer deployment this record is written to that customer\u2019s own SIEM.',
    deliveryTitle: 'Result',
    deliveryLabel: 'Delivery',
    incidentLabel: 'Incident',
    outcomeLabel: 'Outcome',
    auditEvents: 'Audit events',
    noExecution: 'No repair was executed. Repair steps run through an execution runner the operating team supplies; where none is configured, the run ends unresolved and records why rather than claiming a fix that did not happen.',
    contactTitle: 'Seeing this on your own infrastructure',
    contactBody: 'The product runs inside your environment. There is no service of ours in the path, no account, and no telemetry. Reply to the person who sent you this link to arrange a pilot.',
  },
  es: {
    productName: 'Supervisor de Autorreparación',
    rehearsalBadge: 'Ensayo',
    drillBadge: 'Prueba',
    rehearsalIntro: 'Se ejecutó un incidente de ensayo por cada categoría de riesgo contra un despliegue real. Un paso seguro se ejecutó, un paso consecuente tuvo que detenerse y esperar a una persona designada, esa persona fue avisada por un canal real y se produjo un registro de auditoría.',
    drillIntro: 'Se envió un incidente sintético por la misma ruta que sigue una alerta de monitorización: webhook firmado, autenticación, deduplicación, almacenamiento, triaje y clasificación por políticas. Nada fue simulado ni omitido.',
    notProduction: 'Esto es una demostración, no una reparación en producción. Muestra que la aprobación, el aviso y la auditoría funcionan. No es prueba de que se haya resuelto un incidente real.',
    redactionNote: 'Las direcciones, los enlaces y los identificadores de proyecto y despliegue se eliminaron antes de publicar este registro.',
    publishedLabel: 'Publicado',
    expiresLabel: 'El enlace caduca',
    invalidTitle: 'Este enlace no está disponible',
    invalidBody: 'Puede haber caducado, haber sido revocado o haberse copiado de forma incompleta. Pida un enlace vigente a quien se lo envió.',
    passed: 'Superado',
    failed: 'Fallido',
    pass: 'CORRECTO',
    fail: 'FALLO',
    checksTitle: 'Comprobaciones',
    auditTitle: 'Registro de auditoría',
    auditNote: 'En el orden en que ocurrió. En el despliegue de un cliente este registro se escribe en el SIEM del propio cliente.',
    deliveryTitle: 'Resultado',
    deliveryLabel: 'Entrega',
    incidentLabel: 'Incidente',
    outcomeLabel: 'Resultado',
    auditEvents: 'Eventos de auditoría',
    noExecution: 'No se ejecutó ninguna reparación. Los pasos de reparación se ejecutan mediante un ejecutor que aporta el equipo operador; si no hay ninguno configurado, la ejecución termina sin resolver y registra el motivo, en lugar de afirmar una corrección que no ocurrió.',
    contactTitle: 'Verlo en su propia infraestructura',
    contactBody: 'El producto se ejecuta dentro de su entorno. No hay ningún servicio nuestro en la ruta, ni cuenta, ni telemetría. Responda a quien le envió este enlace para organizar una prueba piloto.',
  },
  pt: {
    productName: 'Supervisor de Autorreparação',
    rehearsalBadge: 'Ensaio',
    drillBadge: 'Treino',
    rehearsalIntro: 'Foi executado um incidente de ensaio para cada categoria de risco contra uma implantação real. Um passo seguro foi executado, um passo consequente teve de parar e esperar por uma pessoa designada, essa pessoa foi avisada por um canal real e foi produzido um registo de auditoria.',
    drillIntro: 'Um incidente sintético foi enviado pelo mesmo caminho de um alerta de monitorização: webhook assinado, autenticação, deduplicação, armazenamento, triagem e classificação por políticas. Nada foi simulado nem contornado.',
    notProduction: 'Isto é uma demonstração, não uma reparação em produção. Mostra que a aprovação, o aviso e a auditoria funcionam. Não é prova de que um incidente real foi resolvido.',
    redactionNote: 'Endereços, ligações e identificadores de projeto e implantação foram removidos antes de este registo ser publicado.',
    publishedLabel: 'Publicado',
    expiresLabel: 'A ligação expira',
    invalidTitle: 'Esta ligação não está disponível',
    invalidBody: 'Pode ter expirado, sido revogada ou copiada de forma incompleta. Peça uma ligação atual a quem a enviou.',
    passed: 'Aprovado',
    failed: 'Reprovado',
    pass: 'OK',
    fail: 'FALHA',
    checksTitle: 'Verificações',
    auditTitle: 'Registo de auditoria',
    auditNote: 'Pela ordem em que aconteceu. Na implantação de um cliente este registo é escrito no SIEM do próprio cliente.',
    deliveryTitle: 'Resultado',
    deliveryLabel: 'Entrega',
    incidentLabel: 'Incidente',
    outcomeLabel: 'Resultado',
    auditEvents: 'Eventos de auditoria',
    noExecution: 'Nenhuma reparação foi executada. Os passos de reparação correm através de um executor fornecido pela equipa que opera o sistema; sem um configurado, a execução termina por resolver e regista o motivo, em vez de alegar uma correção que não aconteceu.',
    contactTitle: 'Ver isto na sua própria infraestrutura',
    contactBody: 'O produto corre dentro do seu ambiente. Não existe qualquer serviço nosso no caminho, nem conta, nem telemetria. Responda a quem lhe enviou esta ligação para combinar um piloto.',
  },
  pl: {
    productName: 'Nadzorca Samonaprawy',
    rehearsalBadge: 'Próba',
    drillBadge: 'Ćwiczenie',
    rehearsalIntro: 'Dla każdej kategorii ryzyka uruchomiono próbny incydent na rzeczywistym wdrożeniu. Bezpieczny krok został wykonany, krok o istotnych skutkach musiał się zatrzymać i poczekać na wskazaną osobę, osoba ta otrzymała powiadomienie prawdziwym kanałem, a ślad audytowy został zapisany.',
    drillIntro: 'Syntetyczny incydent przeszedł tą samą drogą co alert z monitoringu: podpisany webhook, uwierzytelnienie, deduplikacja, zapis, triaż i klasyfikacja polityk. Nic nie zostało zasymulowane ani pominięte.',
    notProduction: 'To jest demonstracja, a nie naprawa na produkcji. Pokazuje, że zatwierdzanie, powiadomienia i audyt działają. Nie jest dowodem, że rzeczywisty incydent został naprawiony.',
    redactionNote: 'Adresy, odnośniki oraz identyfikatory projektu i wdrożenia zostały usunięte przed opublikowaniem tego zapisu.',
    publishedLabel: 'Opublikowano',
    expiresLabel: 'Odnośnik wygasa',
    invalidTitle: 'Ten odnośnik jest niedostępny',
    invalidBody: 'Mógł wygasnąć, zostać unieważniony lub skopiowany niekompletnie. Poproś nadawcę o aktualny odnośnik.',
    passed: 'Zaliczone',
    failed: 'Niezaliczone',
    pass: 'OK',
    fail: 'BŁĄD',
    checksTitle: 'Kontrole',
    auditTitle: 'Ślad audytowy',
    auditNote: 'W kolejności zdarzeń. We wdrożeniu klienta ten zapis trafia do jego własnego systemu SIEM.',
    deliveryTitle: 'Wynik',
    deliveryLabel: 'Dostarczenie',
    incidentLabel: 'Incydent',
    outcomeLabel: 'Rezultat',
    auditEvents: 'Zdarzenia audytowe',
    noExecution: 'Nie wykonano żadnej naprawy. Kroki naprawcze uruchamia moduł wykonawczy dostarczony przez zespół operacyjny; gdy nie jest skonfigurowany, przebieg kończy się bez rozwiązania i zapisuje powód, zamiast twierdzić, że coś naprawiono.',
    contactTitle: 'Zobaczyć to na własnej infrastrukturze',
    contactBody: 'Produkt działa wewnątrz Twojego środowiska. Na tej drodze nie ma żadnej naszej usługi, konta ani telemetrii. Odpowiedz osobie, która przesłała ten odnośnik, aby umówić pilotaż.',
  },
  ru: {
    productName: 'Супервизор самовосстановления',
    rehearsalBadge: 'Репетиция',
    drillBadge: 'Учение',
    rehearsalIntro: 'Для каждой категории риска на реальном развёртывании был запущен репетиционный инцидент. Безопасный шаг выполнился, значимый шаг обязан был остановиться и дождаться назначенного человека, этот человек получил уведомление по реальному каналу, и был сформирован журнал аудита.',
    drillIntro: 'Синтетический инцидент прошёл тем же путём, что и реальное оповещение мониторинга: подписанный вебхук, аутентификация, дедупликация, хранение, триаж и классификация политик. Ничего не заглушено и не обойдено.',
    notProduction: 'Это демонстрация, а не восстановление в продакшене. Она показывает, что согласование, уведомление и аудит работают. Она не доказывает, что реальный инцидент был устранён.',
    redactionNote: 'Адреса, ссылки и идентификаторы проекта и развёртывания были удалены до публикации этой записи.',
    publishedLabel: 'Опубликовано',
    expiresLabel: 'Ссылка истекает',
    invalidTitle: 'Эта ссылка недоступна',
    invalidBody: 'Она могла истечь, быть отозвана или скопирована не полностью. Запросите действующую ссылку у отправителя.',
    passed: 'Пройдено',
    failed: 'Не пройдено',
    pass: 'ОК',
    fail: 'СБОЙ',
    checksTitle: 'Проверки',
    auditTitle: 'Журнал аудита',
    auditNote: 'В порядке событий. В развёртывании заказчика эта запись пишется в его собственную SIEM.',
    deliveryTitle: 'Результат',
    deliveryLabel: 'Доставка',
    incidentLabel: 'Инцидент',
    outcomeLabel: 'Итог',
    auditEvents: 'События аудита',
    noExecution: 'Восстановление не выполнялось. Шаги восстановления выполняет исполнитель, который предоставляет эксплуатирующая команда; если он не настроен, запуск завершается без решения и записывает причину, а не заявляет об исправлении, которого не было.',
    contactTitle: 'Увидеть это на своей инфраструктуре',
    contactBody: 'Продукт работает внутри вашей среды. На этом пути нет ни нашего сервиса, ни учётной записи, ни телеметрии. Ответьте тому, кто прислал вам эту ссылку, чтобы договориться о пилоте.',
  },
}
