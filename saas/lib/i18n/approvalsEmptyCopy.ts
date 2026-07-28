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
  rehearsalNote: string
  demoLink: string
}

export const APPROVALS_EMPTY_COPY: Record<ApprovalsEmptyLanguage, ApprovalsEmptyCopy> = {
  en: {
    rehearsalNote: 'If you arrived here from a rehearsal notification, this is expected. A rehearsal proves that a consequential step pauses and that the right person is told — it writes no state, so nothing is queued for approval. Only a real incident places an item here.',
    demoLink: 'Back to the demo page',
  },
  es: {
    rehearsalNote: 'Si ha llegado aquí desde un aviso de ensayo, esto es lo esperado. Un ensayo demuestra que un paso consecuente se detiene y que se avisa a la persona correcta; no guarda ningún estado, así que no queda nada pendiente de aprobación. Solo un incidente real coloca un elemento aquí.',
    demoLink: 'Volver a la página de demostración',
  },
  pt: {
    rehearsalNote: 'Se chegou aqui a partir de um aviso de ensaio, isto é o esperado. Um ensaio prova que um passo consequente para e que a pessoa certa é avisada; não guarda qualquer estado, por isso nada fica pendente de aprovação. Só um incidente real coloca um item aqui.',
    demoLink: 'Voltar à página de demonstração',
  },
  pl: {
    rehearsalNote: 'Jeśli trafiłeś tutaj z powiadomienia o próbie, to jest zachowanie oczekiwane. Próba dowodzi, że krok o istotnych skutkach zatrzymuje się i że właściwa osoba zostaje powiadomiona — nie zapisuje żadnego stanu, więc nic nie czeka na zatwierdzenie. Element pojawia się tu tylko przy rzeczywistym incydencie.',
    demoLink: 'Powrót do strony demonstracji',
  },
  ru: {
    rehearsalNote: 'Если вы перешли сюда из уведомления о репетиции, это ожидаемо. Репетиция доказывает, что значимый шаг останавливается и что нужный человек получает уведомление; она не сохраняет состояние, поэтому на согласование ничего не поставлено. Запись появляется здесь только при реальном инциденте.',
    demoLink: 'Вернуться на страницу демонстрации',
  },
}
