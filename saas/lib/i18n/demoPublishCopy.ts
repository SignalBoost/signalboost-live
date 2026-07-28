// saas/lib/i18n/demoPublishCopy.ts
//
// Copy for the PUBLISH controls on the operator demo page.
//
// Separate from lib/i18n/demoShareCopy.ts on purpose: that file is read by a prospect who
// has no account, this one is read by the owner deciding whether to hand a stranger a link.
// The two audiences need different words for the same act, and mixing them in one table
// invites a sentence written for one to end up in front of the other.
//
// The strings live here rather than in the component because page-copy guards forbid
// user-facing English inside app/ and components/.

export type DemoPublishLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type DemoPublishCopy = {
  publishButton: string
  publishing: string
  publishNote: string
  linkTitle: string
  linkHint: string
  expiresLabel: string
  revokeButton: string
  revoking: string
  revoked: string
  failed: string
  publicWarning: string
}

export const DEMO_PUBLISH_COPY: Record<DemoPublishLanguage, DemoPublishCopy> = {
  en: {
    publishButton: 'Publish this run as a share link',
    publishing: 'Publishing…',
    publishNote: 'Creates a read-only page a prospective buyer can open without an account. Addresses, links and infrastructure identifiers are removed before the record is stored.',
    linkTitle: 'Share link',
    linkHint: 'Copy this now. The token is shown once and is stored only as a hash.',
    expiresLabel: 'Expires',
    revokeButton: 'Revoke this link',
    revoking: 'Revoking…',
    revoked: 'Revoked. The link no longer opens.',
    failed: 'The request did not complete',
    publicWarning: 'Anyone holding this link can open it. Treat it as public.',
  },
  es: {
    publishButton: 'Publicar esta ejecución como enlace',
    publishing: 'Publicando…',
    publishNote: 'Crea una página de solo lectura que un posible comprador puede abrir sin cuenta. Las direcciones, los enlaces y los identificadores de infraestructura se eliminan antes de guardar el registro.',
    linkTitle: 'Enlace para compartir',
    linkHint: 'Cópielo ahora. El token se muestra una sola vez y se guarda únicamente como hash.',
    expiresLabel: 'Caduca',
    revokeButton: 'Revocar este enlace',
    revoking: 'Revocando…',
    revoked: 'Revocado. El enlace ya no abre.',
    failed: 'La solicitud no se completó',
    publicWarning: 'Cualquiera que tenga este enlace puede abrirlo. Trátelo como público.',
  },
  pt: {
    publishButton: 'Publicar esta execução como ligação',
    publishing: 'A publicar…',
    publishNote: 'Cria uma página só de leitura que um potencial comprador pode abrir sem conta. Endereços, ligações e identificadores de infraestrutura são removidos antes de o registo ser guardado.',
    linkTitle: 'Ligação para partilha',
    linkHint: 'Copie-a agora. O token é mostrado uma só vez e é guardado apenas como hash.',
    expiresLabel: 'Expira',
    revokeButton: 'Revogar esta ligação',
    revoking: 'A revogar…',
    revoked: 'Revogada. A ligação já não abre.',
    failed: 'O pedido não foi concluído',
    publicWarning: 'Qualquer pessoa com esta ligação pode abri-la. Trate-a como pública.',
  },
  pl: {
    publishButton: 'Opublikuj ten przebieg jako odnośnik',
    publishing: 'Publikowanie…',
    publishNote: 'Tworzy stronę tylko do odczytu, którą potencjalny klient otworzy bez konta. Adresy, odnośniki i identyfikatory infrastruktury są usuwane przed zapisaniem zapisu.',
    linkTitle: 'Odnośnik do udostępnienia',
    linkHint: 'Skopiuj go teraz. Token pokazywany jest raz i przechowywany wyłącznie jako skrót.',
    expiresLabel: 'Wygasa',
    revokeButton: 'Unieważnij ten odnośnik',
    revoking: 'Unieważnianie…',
    revoked: 'Unieważniony. Odnośnik już się nie otwiera.',
    failed: 'Żądanie nie zostało ukończone',
    publicWarning: 'Każdy, kto ma ten odnośnik, może go otworzyć. Traktuj go jako publiczny.',
  },
  ru: {
    publishButton: 'Опубликовать этот запуск как ссылку',
    publishing: 'Публикация…',
    publishNote: 'Создаёт страницу только для чтения, которую потенциальный покупатель откроет без учётной записи. Адреса, ссылки и идентификаторы инфраструктуры удаляются до сохранения записи.',
    linkTitle: 'Ссылка для отправки',
    linkHint: 'Скопируйте её сейчас. Токен показывается один раз и хранится только в виде хеша.',
    expiresLabel: 'Истекает',
    revokeButton: 'Отозвать эту ссылку',
    revoking: 'Отзыв…',
    revoked: 'Отозвана. Ссылка больше не открывается.',
    failed: 'Запрос не был завершён',
    publicWarning: 'Любой, у кого есть эта ссылка, может её открыть. Считайте её публичной.',
  },
}
