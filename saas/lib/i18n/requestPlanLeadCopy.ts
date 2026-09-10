export type RequestPlanLeadCopy = Readonly<{
  name: string
  email: string
  submit: string
  submitting: string
  successTitle: string
  successBody: string
  saved: string
  queued: string
  notSaved: string
  missing: string
  error: string
}>

type RequestPlanLeadLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

/**
 * Localized lead-intake copy for the public request-plan surface.
 * Kept outside app/components so page UI consumes one reviewed locale catalog rather than
 * introducing new inline English fallbacks that bypass the repository i18n gate.
 */
export const REQUEST_PLAN_LEAD_COPY: Readonly<Record<RequestPlanLeadLang, RequestPlanLeadCopy>> = Object.freeze({
  en: Object.freeze({
    name: 'Your name',
    email: 'Work email',
    submit: 'Request improvement plan',
    submitting: 'Preparing…',
    successTitle: 'Lead intake created',
    successBody: 'The request is now ready for owner review in the Marketing + Sales workflow.',
    saved: 'Saved to owner queue',
    queued: 'Pending owner approval',
    notSaved: 'Prepared, but not saved to the owner queue yet',
    missing: 'Please complete the required fields.',
    error: 'Could not create this request.',
  }),
  es: Object.freeze({
    name: 'Tu nombre',
    email: 'Email de trabajo',
    submit: 'Solicitar plan de mejora',
    submitting: 'Preparando…',
    successTitle: 'Lead intake creado',
    successBody: 'La solicitud ya está lista para revisión del propietario en Marketing + Ventas.',
    saved: 'Guardado en la cola del propietario',
    queued: 'Pendiente de aprobación del propietario',
    notSaved: 'Preparado, pero aún no guardado en la cola del propietario',
    missing: 'Completa los campos requeridos.',
    error: 'No se pudo crear esta solicitud.',
  }),
  pt: Object.freeze({
    name: 'Seu nome',
    email: 'Email profissional',
    submit: 'Solicitar plano de melhoria',
    submitting: 'Preparando…',
    successTitle: 'Lead intake criado',
    successBody: 'A solicitação está pronta para revisão do proprietário no fluxo Marketing + Vendas.',
    saved: 'Salvo na fila do proprietário',
    queued: 'Pendente de aprovação do proprietário',
    notSaved: 'Preparado, mas ainda não salvo na fila do proprietário',
    missing: 'Preencha os campos obrigatórios.',
    error: 'Não foi possível criar esta solicitação.',
  }),
  pl: Object.freeze({
    name: 'Imię i nazwisko',
    email: 'Email firmowy',
    submit: 'Poproś o plan ulepszeń',
    submitting: 'Przygotowywanie…',
    successTitle: 'Lead intake utworzony',
    successBody: 'Prośba jest gotowa do przeglądu właściciela w workflow Marketing + Sprzedaż.',
    saved: 'Zapisano w kolejce właściciela',
    queued: 'Oczekuje na akceptację właściciela',
    notSaved: 'Przygotowano, ale jeszcze nie zapisano w kolejce właściciela',
    missing: 'Uzupełnij wymagane pola.',
    error: 'Nie udało się utworzyć tej prośby.',
  }),
  ru: Object.freeze({
    name: 'Ваше имя',
    email: 'Рабочий email',
    submit: 'Запросить план улучшений',
    submitting: 'Подготовка…',
    successTitle: 'Lead intake создан',
    successBody: 'Запрос готов к проверке владельцем в workflow Marketing + Sales.',
    saved: 'Сохранено в очереди владельца',
    queued: 'Ожидает утверждения владельца',
    notSaved: 'Подготовлено, но ещё не сохранено в очереди владельца',
    missing: 'Заполните обязательные поля.',
    error: 'Не удалось создать этот запрос.',
  }),
})
