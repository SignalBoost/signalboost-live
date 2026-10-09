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

export type DemoPublishLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

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
  de: {
    publishButton: 'Diesen Lauf als Freigabelink veröffentlichen',
    publishing: 'Wird veröffentlicht…',
    publishNote: 'Erstellt eine schreibgeschützte Seite, die ein potenzieller Käufer ohne Konto öffnen kann. Adressen, Links und Infrastruktur-Kennungen werden vor dem Speichern des Datensatzes entfernt.',
    linkTitle: 'Freigabelink',
    linkHint: 'Kopieren Sie ihn jetzt. Das Token wird nur einmal angezeigt und nur als Hash gespeichert.',
    expiresLabel: 'Läuft ab',
    revokeButton: 'Diesen Link widerrufen',
    revoking: 'Wird widerrufen…',
    revoked: 'Widerrufen. Der Link lässt sich nicht mehr öffnen.',
    failed: 'Die Anfrage wurde nicht abgeschlossen',
    publicWarning: 'Jeder, der diesen Link besitzt, kann ihn öffnen. Behandeln Sie ihn als öffentlich.',
  },
  fr: {
    publishButton: 'Publier cette exécution comme lien de partage',
    publishing: 'Publication…',
    publishNote: 'Crée une page en lecture seule qu\'un acheteur potentiel peut ouvrir sans compte. Les adresses, liens et identifiants d\'infrastructure sont supprimés avant l\'enregistrement.',
    linkTitle: 'Lien de partage',
    linkHint: 'Copiez-le maintenant. Le jeton n\'est affiché qu\'une fois et n\'est stocké que sous forme de hachage.',
    expiresLabel: 'Expire',
    revokeButton: 'Révoquer ce lien',
    revoking: 'Révocation…',
    revoked: 'Révoqué. Le lien ne s\'ouvre plus.',
    failed: 'La requête n’a pas abouti',
    publicWarning: 'Toute personne disposant de ce lien peut l\'ouvrir. Considérez-le comme public.',
  },
  it: {
    publishButton: 'Pubblica questa esecuzione come link di condivisione',
    publishing: 'Pubblicazione…',
    publishNote: 'Crea una pagina di sola lettura che un potenziale acquirente può aprire senza account. Indirizzi, link e identificativi dell\'infrastruttura vengono rimossi prima del salvataggio del record.',
    linkTitle: 'Link di condivisione',
    linkHint: 'Copialo ora. Il token viene mostrato una sola volta ed è salvato solo come hash.',
    expiresLabel: 'Scade',
    revokeButton: 'Revoca questo link',
    revoking: 'Revoca in corso…',
    revoked: 'Revocato. Il link non si apre più.',
    failed: 'La richiesta non è stata completata',
    publicWarning: 'Chiunque abbia questo link può aprirlo. Consideralo pubblico.',
  },
  ja: {
    publishButton: 'この実行を共有リンクとして公開',
    publishing: '公開中…',
    publishNote: '見込み購入者がアカウントなしで開ける読み取り専用ページを作成します。記録を保存する前に、アドレス、リンク、インフラ識別子は削除されます。',
    linkTitle: '共有リンク',
    linkHint: '今すぐコピーしてください。トークンは一度だけ表示され、ハッシュとしてのみ保存されます。',
    expiresLabel: '有効期限',
    revokeButton: 'このリンクを取り消す',
    revoking: '取り消し中…',
    revoked: '取り消しました。このリンクは開けなくなりました。',
    failed: 'リクエストは完了しませんでした',
    publicWarning: 'このリンクを持つ人は誰でも開けます。公開情報として扱ってください。',
  },
  ko: {
    publishButton: '이 실행을 공유 링크로 게시',
    publishing: '게시 중…',
    publishNote: '잠재 구매자가 계정 없이 열 수 있는 읽기 전용 페이지를 만듭니다. 기록이 저장되기 전에 주소, 링크, 인프라 식별자가 제거됩니다.',
    linkTitle: '공유 링크',
    linkHint: '지금 복사하세요. 토큰은 한 번만 표시되며 해시로만 저장됩니다.',
    expiresLabel: '만료',
    revokeButton: '이 링크 취소',
    revoking: '취소 중…',
    revoked: '취소되었습니다. 이제 링크가 열리지 않습니다.',
    failed: '요청이 완료되지 않았습니다',
    publicWarning: '이 링크를 가진 누구나 열 수 있습니다. 공개된 것으로 취급하세요.',
  },
  ar: {
    publishButton: 'انشر هذا التشغيل كرابط مشاركة',
    publishing: 'جارٍ النشر…',
    publishNote: 'ينشئ صفحة للقراءة فقط يمكن للمشتري المحتمل فتحها دون حساب. تُزال العناوين والروابط ومعرّفات البنية التحتية قبل حفظ السجل.',
    linkTitle: 'رابط المشاركة',
    linkHint: 'انسخه الآن. يُعرض الرمز مرة واحدة فقط ويُخزَّن كتجزئة فقط.',
    expiresLabel: 'تنتهي الصلاحية',
    revokeButton: 'إلغاء هذا الرابط',
    revoking: 'جارٍ الإلغاء…',
    revoked: 'تم الإلغاء. لم يعد الرابط يفتح.',
    failed: 'لم يكتمل الطلب',
    publicWarning: 'يمكن لأي شخص يملك هذا الرابط فتحه. تعامل معه على أنه عام.',
  },
}
