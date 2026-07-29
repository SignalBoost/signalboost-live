// saas/lib/supervisor/portable/notification-copy.ts
//
// APPROVAL NOTIFICATIONS IN THE READER'S LANGUAGE.
//
// The approval request is the one message this product sends to a human who may never open
// the console: an engineer on call, at night, deciding whether a credential rotation should
// proceed. If it arrives in a language they do not read, the safety property degrades into a
// delay — and the buyer's security review will ask about it long before their engineers do.
//
// A Brazilian buyer's approvers should be asked in Portuguese. That is not a nicety; the
// decision the message asks for is consequential, and comprehension is part of consent.
//
// THIS LIVES IN THE PORTABLE PAYLOAD, not in the platform's locale files, because it travels
// with the product. A buyer installing the package gets these translations; they do not have
// to supply their own to get a message their staff can read. The platform's own i18n system
// is a test-rig concern and has no place here.
//
// NO DEPENDENCIES, no bundler, no JSON loading — a typed table and a lookup. The payload's
// zero-dependency guarantee is a selling point and this file must not be what breaks it.
//
// ADDING A LANGUAGE is deliberately a code change reviewed like any other. A machine
// translation of "this step will delete data, approve only if you are certain" is not a
// place to be casual.

export type SupervisorLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export const SUPERVISOR_LOCALES: SupervisorLocale[] = ['en', 'es', 'pt', 'pl', 'ru']

export interface ApprovalCopy {
  subjectSuffix: string
  heading: string
  intro: string
  categories: { financial: string; destructive: string; credentialSecurity: string; other: string }
  rows: { category: string; reason: string; step: string; description: string; incident: string; dispatch: string }
  noDescription: string
  cta: string
  footer: string
}

const COPY: Record<SupervisorLocale, ApprovalCopy> = {
  en: {
    subjectSuffix: 'step — your approval needed',
    heading: 'A repair step is waiting for your approval',
    intro: 'The Supervisor diagnosed an incident and prepared a fix, but one step falls into a category it will never run on its own. Nothing was executed. Review and approve it if you want it to proceed.',
    categories: { financial: 'Money / billing / payments', destructive: 'Destructive / irreversible', credentialSecurity: 'Credentials / security', other: 'Consequential action' },
    rows: { category: 'Category', reason: 'Why it paused', step: 'Step', description: 'What it would do', incident: 'Incident', dispatch: 'Dispatch' },
    noDescription: '(no description)',
    cta: 'Review in the Supervisor console',
    footer: 'The Supervisor never runs money, destructive, or credential steps on its own — only a named approver can.',
  },
  es: {
    subjectSuffix: 'requiere su aprobación',
    heading: 'Un paso de reparación espera su aprobación',
    intro: 'El Supervisor diagnosticó un incidente y preparó una corrección, pero un paso pertenece a una categoría que nunca ejecuta por su cuenta. No se ejecutó nada. Revíselo y apruébelo si desea que continúe.',
    categories: { financial: 'Dinero / facturación / pagos', destructive: 'Destructivo / irreversible', credentialSecurity: 'Credenciales / seguridad', other: 'Acción consecuente' },
    rows: { category: 'Categoría', reason: 'Motivo de la pausa', step: 'Paso', description: 'Qué haría', incident: 'Incidente', dispatch: 'Despacho' },
    noDescription: '(sin descripción)',
    cta: 'Revisar en la consola del Supervisor',
    footer: 'El Supervisor nunca ejecuta por su cuenta pasos de dinero, destructivos o de credenciales: solo puede hacerlo una persona aprobadora designada.',
  },
  pt: {
    subjectSuffix: 'precisa da sua aprovação',
    heading: 'Um passo de reparação aguarda a sua aprovação',
    intro: 'O Supervisor diagnosticou um incidente e preparou uma correção, mas um passo pertence a uma categoria que ele nunca executa sozinho. Nada foi executado. Reveja e aprove se quiser que prossiga.',
    categories: { financial: 'Dinheiro / faturação / pagamentos', destructive: 'Destrutivo / irreversível', credentialSecurity: 'Credenciais / segurança', other: 'Ação consequente' },
    rows: { category: 'Categoria', reason: 'Motivo da pausa', step: 'Passo', description: 'O que faria', incident: 'Incidente', dispatch: 'Despacho' },
    noDescription: '(sem descrição)',
    cta: 'Rever na consola do Supervisor',
    footer: 'O Supervisor nunca executa sozinho passos de dinheiro, destrutivos ou de credenciais — só uma pessoa aprovadora designada o pode fazer.',
  },
  pl: {
    subjectSuffix: 'wymaga Twojego zatwierdzenia',
    heading: 'Krok naprawczy czeka na Twoje zatwierdzenie',
    intro: 'Nadzorca zdiagnozował incydent i przygotował naprawę, ale jeden krok należy do kategorii, której nigdy nie wykona samodzielnie. Nic nie zostało wykonane. Sprawdź i zatwierdź, jeśli ma być kontynuowany.',
    categories: { financial: 'Pieniądze / rozliczenia / płatności', destructive: 'Destrukcyjne / nieodwracalne', credentialSecurity: 'Poświadczenia / bezpieczeństwo', other: 'Działanie o istotnych skutkach' },
    rows: { category: 'Kategoria', reason: 'Powód zatrzymania', step: 'Krok', description: 'Co by zrobił', incident: 'Incydent', dispatch: 'Zlecenie' },
    noDescription: '(brak opisu)',
    cta: 'Sprawdź w konsoli Nadzorcy',
    footer: 'Nadzorca nigdy samodzielnie nie wykonuje kroków finansowych, destrukcyjnych ani dotyczących poświadczeń — może to zrobić wyłącznie wskazana osoba zatwierdzająca.',
  },
  ru: {
    subjectSuffix: 'требует вашего согласования',
    heading: 'Шаг восстановления ожидает вашего согласования',
    intro: 'Супервизор диагностировал инцидент и подготовил исправление, но один шаг относится к категории, которую он никогда не выполняет самостоятельно. Ничего не выполнено. Проверьте и согласуйте, если он должен продолжиться.',
    categories: { financial: 'Деньги / счета / платежи', destructive: 'Разрушительное / необратимое', credentialSecurity: 'Учётные данные / безопасность', other: 'Значимое действие' },
    rows: { category: 'Категория', reason: 'Причина остановки', step: 'Шаг', description: 'Что он сделал бы', incident: 'Инцидент', dispatch: 'Отправка' },
    noDescription: '(без описания)',
    cta: 'Открыть в консоли Супервизора',
    footer: 'Супервизор никогда сам не выполняет шаги с деньгами, разрушительные действия или операции с учётными данными — это может сделать только назначенный согласующий.',
  },
}

/**
 * Resolve a locale tag to a supported language. Accepts full tags such as `pt-BR`, since a
 * buyer configures a region rather than a language code. Anything unrecognised falls back to
 * English: an approval request in the wrong language is bad, and no approval request at all
 * would be worse.
 */
export function resolveSupervisorLocale(value?: string | null): SupervisorLocale {
  const short = String(value || '').slice(0, 2).toLowerCase()
  return (SUPERVISOR_LOCALES as string[]).includes(short) ? (short as SupervisorLocale) : 'en'
}

/** Approval-request copy for a locale, falling back to English. */
export function approvalCopy(locale?: string | null): ApprovalCopy {
  return COPY[resolveSupervisorLocale(locale)]
}

/** The label for a policy category, in the reader's language. */
export function categoryLabel(locale: string | null | undefined, category?: string | null): string {
  const copy = approvalCopy(locale)
  if (category === 'financial') return copy.categories.financial
  if (category === 'destructive') return copy.categories.destructive
  if (category === 'credential_security') return copy.categories.credentialSecurity
  return copy.categories.other
}
