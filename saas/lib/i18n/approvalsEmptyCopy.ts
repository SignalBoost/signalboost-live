// saas/lib/i18n/approvalsEmptyCopy.ts
//
// The explanation shown when the approval queue is empty.
//
// WHY THIS EXISTS. A rehearsal sends a REAL notification, and that notification carries a
// "Review and approve" link to this page — because for a real incident that is exactly the
// right destination. But a rehearsal deliberately writes no state, which is what makes it
// safe to run repeatedly in front of someone. Follow the link from a rehearsal and you
// arrive at an empty queue with no explanation, which reads as a broken product at the worst
// possible moment.
//
// The queue being empty is correct. What was missing was anything telling the reader why.

export type ApprovalsEmptyLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

export type ApprovalsEmptyCopy = {
  status: string
  title: string
  rehearsalNote: string
  noButtonNote: string
  demoLink: string
}

export const APPROVALS_EMPTY_COPY: Record<ApprovalsEmptyLanguage, ApprovalsEmptyCopy> = {
  en: {
    status: 'No approval required',
    title: 'Nothing is waiting for approval',
    rehearsalNote: 'If you arrived here from a rehearsal notification, this is expected. A rehearsal proves that a consequential step pauses and that the right person is told. It writes no state, so nothing is queued for approval. Only a real incident places an item here.',
    noButtonNote: 'There is no approval button because there is no real pending approval item.',
    demoLink: 'Back to the demo page',
  },
  es: {
    status: 'No se requiere aprobación',
    title: 'No hay nada esperando aprobación',
    rehearsalNote: 'Si ha llegado aquí desde un aviso de ensayo, esto es lo esperado. Un ensayo demuestra que un paso consecuente se detiene y que se avisa a la persona correcta. No guarda ningún estado, así que no queda nada pendiente de aprobación. Solo un incidente real coloca un elemento aquí.',
    noButtonNote: 'No hay botón de aprobación porque no existe un elemento real pendiente de aprobación.',
    demoLink: 'Volver a la página de demostración',
  },
  pt: {
    status: 'Nenhuma aprovação necessária',
    title: 'Nada está à espera de aprovação',
    rehearsalNote: 'Se chegou aqui a partir de um aviso de ensaio, isto é o esperado. Um ensaio prova que um passo consequente para e que a pessoa certa é avisada. Não guarda qualquer estado, por isso nada fica pendente de aprovação. Só um incidente real coloca um item aqui.',
    noButtonNote: 'Não há botão de aprovação porque não existe um item real pendente de aprovação.',
    demoLink: 'Voltar à página de demonstração',
  },
  pl: {
    status: 'Zatwierdzenie nie jest wymagane',
    title: 'Nic nie czeka na zatwierdzenie',
    rehearsalNote: 'Jeśli trafiłeś tutaj z powiadomienia o próbie, to jest zachowanie oczekiwane. Próba dowodzi, że krok o istotnych skutkach zatrzymuje się i że właściwa osoba zostaje powiadomiona. Nie zapisuje żadnego stanu, więc nic nie czeka na zatwierdzenie. Element pojawia się tu tylko przy rzeczywistym incydencie.',
    noButtonNote: 'Nie ma przycisku zatwierdzenia, ponieważ nie istnieje rzeczywisty element oczekujący na zatwierdzenie.',
    demoLink: 'Powrót do strony demonstracji',
  },
  ru: {
    status: 'Согласование не требуется',
    title: 'Ничего не ожидает согласования',
    rehearsalNote: 'Если вы перешли сюда из уведомления о репетиции, это ожидаемо. Репетиция доказывает, что значимый шаг останавливается и что нужный человек получает уведомление. Она не сохраняет состояние, поэтому на согласование ничего не поставлено. Запись появляется здесь только при реальном инциденте.',
    noButtonNote: 'Кнопки согласования нет, потому что нет реального ожидающего элемента.',
    demoLink: 'Вернуться на страницу демонстрации',
  },
  de: {
    status: 'Keine Genehmigung erforderlich',
    title: 'Nichts wartet auf Genehmigung',
    rehearsalNote: 'Wenn Sie über eine Probelauf-Benachrichtigung hierher gelangt sind, ist dies zu erwarten. Ein Probelauf belegt, dass ein folgenreicher Schritt pausiert und die richtige Person informiert wird. Er schreibt keinen Zustand, daher wird nichts zur Genehmigung eingereiht. Nur ein echter Vorfall legt hier einen Eintrag ab.',
    noButtonNote: 'Es gibt keine Genehmigungsschaltfläche, da kein echter ausstehender Genehmigungseintrag vorhanden ist.',
    demoLink: 'Zurück zur Demo-Seite',
  },
  fr: {
    status: 'Aucune approbation requise',
    title: 'Rien n\'attend d\'approbation',
    rehearsalNote: 'Si vous êtes arrivé ici depuis une notification de répétition, c\'est normal. Une répétition prouve qu\'une étape à conséquences se met en pause et que la bonne personne est prévenue. Elle n\'enregistre aucun état, donc rien n\'est mis en attente d\'approbation. Seul un incident réel place un élément ici.',
    noButtonNote: 'Il n\'y a pas de bouton d\'approbation, car aucun élément d\'approbation réel n\'est en attente.',
    demoLink: 'Retour à la page de démo',
  },
  it: {
    status: 'Nessuna approvazione richiesta',
    title: 'Nulla è in attesa di approvazione',
    rehearsalNote: 'Se sei arrivato qui da una notifica di prova, è normale. Una prova dimostra che un passaggio con conseguenze si mette in pausa e che viene avvisata la persona giusta. Non scrive alcuno stato, quindi nulla viene messo in coda per l\'approvazione. Solo un incidente reale inserisce un elemento qui.',
    noButtonNote: 'Non c\'è alcun pulsante di approvazione perché non esiste un elemento reale in attesa di approvazione.',
    demoLink: 'Torna alla pagina demo',
  },
  ja: {
    status: '承認は不要です',
    title: '承認待ちの項目はありません',
    rehearsalNote: 'リハーサル通知からここに来た場合、これは想定どおりです。リハーサルは、重要な影響を伴うステップが一時停止し、適切な担当者に通知されることを確認するものです。状態は書き込まれないため、承認待ちのキューには何も入りません。ここに項目が表示されるのは実際のインシデントの場合のみです。',
    noButtonNote: '実際に保留中の承認項目がないため、承認ボタンはありません。',
    demoLink: 'デモページに戻る',
  },
  ko: {
    status: '승인 필요 없음',
    title: '승인을 기다리는 항목이 없습니다',
    rehearsalNote: '리허설 알림을 통해 이곳에 왔다면 정상입니다. 리허설은 중대한 단계가 일시 중지되고 적절한 담당자에게 알림이 전달되는지 확인합니다. 상태를 기록하지 않으므로 승인 대기열에 추가되는 항목은 없습니다. 실제 인시던트만 이곳에 항목을 추가합니다.',
    noButtonNote: '실제로 대기 중인 승인 항목이 없으므로 승인 버튼이 없습니다.',
    demoLink: '데모 페이지로 돌아가기',
  },
  ar: {
    status: 'لا تلزم موافقة',
    title: 'لا يوجد شيء بانتظار الموافقة',
    rehearsalNote: 'إذا وصلت إلى هنا من إشعار تجربة، فهذا متوقَّع. تُثبت التجربة أن الخطوة ذات العواقب تتوقف مؤقتًا وأن الشخص المناسب يتم إبلاغه. لا تكتب التجربة أي حالة، لذا لا يُدرج أي شيء في انتظار الموافقة. وحده الحادث الحقيقي يضع عنصرًا هنا.',
    noButtonNote: 'لا يوجد زر موافقة لعدم وجود عنصر موافقة معلّق فعليًا.',
    demoLink: 'العودة إلى صفحة العرض التوضيحي',
  },
}
