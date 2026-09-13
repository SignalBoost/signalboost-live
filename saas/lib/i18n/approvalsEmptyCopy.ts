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

export type ApprovalsEmptyLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

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
}
