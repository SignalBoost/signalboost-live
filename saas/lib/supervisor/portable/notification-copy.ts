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

export type SupervisorLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

export const SUPERVISOR_LOCALES: SupervisorLocale[] = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']

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
  de: {
    subjectSuffix: 'Schritt – Ihre Freigabe erforderlich',
    heading: 'Ein Reparaturschritt wartet auf Ihre Freigabe',
    intro: 'Der Supervisor hat einen Vorfall diagnostiziert und eine Korrektur vorbereitet, aber ein Schritt fällt in eine Kategorie, die er niemals selbstständig ausführt. Es wurde nichts ausgeführt. Prüfen und genehmigen Sie ihn, wenn er fortgesetzt werden soll.',
    categories: { financial: 'Geld / Abrechnung / Zahlungen', destructive: 'Destruktiv / unumkehrbar', credentialSecurity: 'Zugangsdaten / Sicherheit', other: 'Folgenreiche Aktion' },
    rows: { category: 'Kategorie', reason: 'Grund der Pause', step: 'Schritt', description: 'Was ausgeführt würde', incident: 'Vorfall', dispatch: 'Versand' },
    noDescription: '(keine Beschreibung)',
    cta: 'In der Supervisor-Konsole prüfen',
    footer: 'Der Supervisor führt Schritte mit Geldbezug, destruktive oder zugangsdatenbezogene Schritte nie selbstständig aus – das kann nur eine benannte genehmigende Person.',
  },
  fr: {
    subjectSuffix: 'étape — votre approbation est requise',
    heading: 'Une étape de réparation attend votre approbation',
    intro: 'Le Superviseur a diagnostiqué un incident et préparé un correctif, mais une étape relève d’une catégorie qu’il n’exécute jamais de lui-même. Rien n’a été exécuté. Examinez-la et approuvez-la si vous souhaitez qu’elle soit effectuée.',
    categories: { financial: 'Argent / facturation / paiements', destructive: 'Destructif / irréversible', credentialSecurity: 'Identifiants / sécurité', other: 'Action lourde de conséquences' },
    rows: { category: 'Catégorie', reason: 'Motif de la pause', step: 'Étape', description: 'Ce qu\'il ferait', incident: 'Incident', dispatch: 'Envoi' },
    noDescription: '(aucune description)',
    cta: 'Examiner dans la console du Superviseur',
    footer: 'Le Superviseur n\'exécute jamais de lui-même des étapes financières, destructives ou liées aux identifiants : seul un approbateur désigné peut le faire.',
  },
  it: {
    subjectSuffix: 'passaggio — serve la tua approvazione',
    heading: 'Un passaggio di riparazione è in attesa della tua approvazione',
    intro: 'Il Supervisore ha diagnosticato un incidente e preparato una correzione, ma un passaggio rientra in una categoria che non eseguirà mai in autonomia. Non è stato eseguito nulla. Esaminalo e approvalo se vuoi che proceda.',
    categories: { financial: 'Denaro / fatturazione / pagamenti', destructive: 'Distruttivo / irreversibile', credentialSecurity: 'Credenziali / sicurezza', other: 'Azione con conseguenze' },
    rows: { category: 'Categoria', reason: 'Motivo della pausa', step: 'Passaggio', description: 'Cosa farebbe', incident: 'Incidente', dispatch: 'Invio' },
    noDescription: '(nessuna descrizione)',
    cta: 'Esamina nella console del Supervisore',
    footer: 'Il Supervisore non esegue mai da solo passaggi che riguardano denaro, operazioni distruttive o credenziali: può farlo solo un approvatore designato.',
  },
  ja: {
    subjectSuffix: 'ステップ — 承認が必要です',
    heading: '修復ステップが承認待ちです',
    intro: 'スーパーバイザーはインシデントを診断して修正を準備しましたが、1 つのステップが自動では決して実行しないカテゴリに該当します。何も実行されていません。続行する場合は、確認して承認してください。',
    categories: { financial: '金銭 / 請求 / 支払い', destructive: '破壊的 / 元に戻せない', credentialSecurity: '認証情報 / セキュリティ', other: '影響の大きい操作' },
    rows: { category: 'カテゴリ', reason: '一時停止の理由', step: 'ステップ', description: '実行される内容', incident: 'インシデント', dispatch: '送信' },
    noDescription: '（説明なし）',
    cta: 'スーパーバイザーコンソールで確認',
    footer: 'スーパーバイザーは、金銭・破壊的操作・認証情報に関わるステップを単独で実行することはありません。実行できるのは指名された承認者のみです。',
  },
  ko: {
    subjectSuffix: '단계 — 승인이 필요합니다',
    heading: '복구 단계가 승인을 기다리고 있습니다',
    intro: '슈퍼바이저가 인시던트를 진단하고 수정 사항을 준비했지만, 한 단계가 자체적으로는 절대 실행하지 않는 범주에 속합니다. 아무것도 실행되지 않았습니다. 진행하려면 검토 후 승인하세요.',
    categories: { financial: '금전 / 청구 / 결제', destructive: '파괴적 / 되돌릴 수 없음', credentialSecurity: '자격 증명 / 보안', other: '중대한 작업' },
    rows: { category: '카테고리', reason: '일시 중지 사유', step: '단계', description: '수행할 작업', incident: '인시던트', dispatch: '발송' },
    noDescription: '(설명 없음)',
    cta: '슈퍼바이저 콘솔에서 검토',
    footer: '슈퍼바이저는 금전, 파괴적 작업 또는 자격 증명 관련 단계를 절대 단독으로 실행하지 않습니다. 지정된 승인자만 실행할 수 있습니다.',
  },
  ar: {
    subjectSuffix: 'خطوة — مطلوب موافقتك',
    heading: 'خطوة إصلاح بانتظار موافقتك',
    intro: 'شخّص المشرف حادثة وأعدّ إصلاحًا، لكن إحدى الخطوات تندرج ضمن فئة لا ينفّذها أبدًا من تلقاء نفسه. لم يُنفَّذ أي شيء. راجعها ووافق عليها إذا كنت تريد المتابعة.',
    categories: { financial: 'الأموال / الفوترة / المدفوعات', destructive: 'مدمّر / لا رجعة فيه', credentialSecurity: 'بيانات الاعتماد / الأمان', other: 'إجراء ذو عواقب' },
    rows: { category: 'الفئة', reason: 'سبب الإيقاف المؤقت', step: 'الخطوة', description: 'ما سيقوم به', incident: 'حادثة', dispatch: 'الإرسال' },
    noDescription: '(بلا وصف)',
    cta: 'المراجعة في وحدة تحكم المشرف',
    footer: 'لا ينفّذ المشرف أبدًا من تلقاء نفسه خطوات تتعلق بالأموال أو الخطوات المدمّرة أو المتعلقة ببيانات الاعتماد — لا يمكن ذلك إلا لمعتمِد مُسمّى.',
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
