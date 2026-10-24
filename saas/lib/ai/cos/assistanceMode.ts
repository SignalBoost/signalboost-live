// saas/lib/ai/cos/assistanceMode.ts
//
// How much COS does on its own for a software request, chosen once by each user and remembered for them:
//   guide        — Guide me: COS explains the fix; Builder runs nothing.
//   collaborate  — Work with me: Builder works and verifies in its private sandbox, then stops before anything leaves
//                  it (repository, pull request, merge, deployment) until the user says "go".
//   autonomous   — Handle it for me (default): the whole pipeline, end to end.
// Shared by the browser (selector, request context) and the server (routing, job metadata). No server imports.

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../i18n/supportedLanguages.ts'

export const ASSISTANCE_MODES = ['guide', 'collaborate', 'autonomous'] as const
export type AssistanceMode = (typeof ASSISTANCE_MODES)[number]
export const DEFAULT_ASSISTANCE_MODE: AssistanceMode = 'autonomous'
/** Key under the signed-in user's account metadata (follows the user across devices) and the browser cache key. */
export const ASSISTANCE_MODE_METADATA_KEY = 'assistanceMode'
export const ASSISTANCE_MODE_STORAGE_KEY = 'itmounts_assistance_mode'

export function normalizeAssistanceMode(value: unknown): AssistanceMode | null {
  return typeof value === 'string' && (ASSISTANCE_MODES as readonly string[]).includes(value) ? value as AssistanceMode : null
}

type Copy = Readonly<Record<SupportedLanguage, string>>
const language = (value: unknown): SupportedLanguage =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value) ? value as SupportedLanguage : 'en'
export const assistanceCopy = (copy: Copy, lang: unknown): string => copy[language(lang)]

export const ASSISTANCE_MODE_LABEL: Readonly<Record<AssistanceMode, Copy>> = {
  guide: { en: 'Guide me', es: 'Guíame', pt: 'Me oriente', pl: 'Poprowadź mnie', ru: 'Подскажи, как', de: 'Anleiten', fr: 'Guide-moi', it: 'Guidami', ja: 'ガイドして', ko: '안내해 줘', ar: 'أرشدني' },
  collaborate: { en: 'Work with me', es: 'Trabajemos juntos', pt: 'Trabalhe comigo', pl: 'Pracuj ze mną', ru: 'Работаем вместе', de: 'Mit mir arbeiten', fr: 'Travaillons ensemble', it: 'Lavoriamo insieme', ja: '一緒に作業', ko: '함께 작업', ar: 'اعمل معي' },
  autonomous: { en: 'Handle it for me', es: 'Hazlo por mí', pt: 'Faça por mim', pl: 'Zrób to za mnie', ru: 'Сделай за меня', de: 'Für mich erledigen', fr: 'Fais-le pour moi', it: 'Fallo per me', ja: '任せる', ko: '맡길게요', ar: 'تولَّ الأمر عني' },
}

export const ASSISTANCE_MODE_DESCRIPTION: Readonly<Record<AssistanceMode, Copy>> = {
  guide: { en: 'Explains how to do it; nothing is run.', es: 'Explica cómo hacerlo; no se ejecuta nada.', pt: 'Explica como fazer; nada é executado.', pl: 'Wyjaśnia, jak to zrobić; nic nie jest uruchamiane.', ru: 'Объясняет, как это сделать; ничего не запускается.', de: 'Erklärt, wie es geht; nichts wird ausgeführt.', fr: 'Explique comment faire ; rien n’est exécuté.', it: 'Spiega come farlo; non viene eseguito nulla.', ja: '手順を説明します。何も実行しません。', ko: '방법을 설명하며 아무것도 실행하지 않습니다.', ar: 'يشرح كيفية التنفيذ؛ لا يتم تشغيل أي شيء.' },
  collaborate: { en: 'Builds and tests in a private sandbox, then waits for your “go” before anything leaves it.', es: 'Construye y prueba en un entorno privado y espera tu «adelante» antes de que algo salga de él.', pt: 'Cria e testa em um ambiente privado e espera seu “pode seguir” antes de qualquer coisa sair dele.', pl: 'Buduje i testuje w prywatnej piaskownicy, a przed wyjściem czegokolwiek poza nią czeka na Twoje „dalej”.', ru: 'Создаёт и тестирует в закрытой песочнице и ждёт вашего «давай», прежде чем что-либо выйдет за её пределы.', de: 'Baut und testet in einer privaten Sandbox und wartet auf Ihr „los“, bevor etwas sie verlässt.', fr: 'Construit et teste dans un bac à sable privé, puis attend votre « vas-y » avant que quoi que ce soit n’en sorte.', it: 'Costruisce e testa in una sandbox privata e attende il tuo «vai» prima che qualcosa ne esca.', ja: '非公開のサンドボックスで構築・テストし、外に出す前にあなたの「進めて」を待ちます。', ko: '비공개 샌드박스에서 빌드하고 테스트한 뒤, 외부로 내보내기 전에 “진행해”를 기다립니다.', ar: 'يبني ويختبر في بيئة معزولة خاصة، ثم ينتظر «تابع» منك قبل إخراج أي شيء منها.' },
  autonomous: { en: 'Does the whole job end to end.', es: 'Hace todo el trabajo de principio a fin.', pt: 'Faz todo o trabalho de ponta a ponta.', pl: 'Wykonuje całą pracę od początku do końca.', ru: 'Выполняет всю работу от начала до конца.', de: 'Erledigt die ganze Arbeit von Anfang bis Ende.', fr: 'Fait tout le travail de bout en bout.', it: 'Svolge tutto il lavoro dall’inizio alla fine.', ja: '最初から最後まですべて行います。', ko: '처음부터 끝까지 모든 작업을 수행합니다.', ar: 'ينجز العمل كاملًا من البداية إلى النهاية.' },
}

export const ASSISTANCE_MODE_ARIA: Copy = { en: 'Assistance mode', es: 'Modo de asistencia', pt: 'Modo de assistência', pl: 'Tryb pomocy', ru: 'Режим помощи', de: 'Hilfemodus', fr: 'Mode d’assistance', it: 'Modalità di assistenza', ja: 'サポートモード', ko: '지원 모드', ar: 'وضع المساعدة' }

// The user's "go" after a Work with me pause, in every supported language. Whole message only: a sentence that merely
// contains "yes" is a conversation, not an approval of an external action.
const APPROVAL = /^(?:go|go ahead|do it|proceed|yes|yes,? go ahead|yes,? do it|publish it|approve|approved|adelante|sí|si|hazlo|procede|publícalo|aprobado|pode seguir|sim|faça|faça isso|prossiga|publique|aprovado|dalej|tak|zrób to|kontynuuj|opublikuj|zatwierdzam|да|давай|вперёд|вперед|продолжай|публикуй|одобряю|los|ja|mach es|weiter|veröffentlichen|genehmigt|vas-y|oui|fais-le|continue|publie|approuvé|vai|sì|procedi|fallo|pubblica|approvato|はい|進めて|お願いします|実行して|公開して|承認|네|진행해|좋아요|해 주세요|게시해|승인|نعم|تابع|نفّذ|نفذ|موافق|انشر)$/i

export function isAssistanceApproval(message: string): boolean {
  return APPROVAL.test(String(message || '').trim().replace(/[.!。！]+$/u, '').replace(/^[«“"']|[»”"']$/gu, '').trim())
}

/** Builder verified the work in its sandbox and stopped before publishing it (Work with me). */
export const COLLABORATE_PUBLICATION_PAUSED: Copy = {
  en: 'Builder finished and verified the work in its private sandbox. Nothing has left it: no repository, pull request, merge or deployment yet. Reply “go” to publish it the way you asked; I will then report the repository, pull request, preview and live endpoint check.',
  es: 'Builder terminó y verificó el trabajo en su entorno privado. Nada ha salido de él: todavía no hay repositorio, pull request, merge ni despliegue. Responde «adelante» para publicarlo como pediste; después te informaré del repositorio, el pull request, la vista previa y la comprobación del endpoint en vivo.',
  pt: 'O Builder concluiu e verificou o trabalho em seu ambiente privado. Nada saiu dele: ainda não há repositório, pull request, merge nem implantação. Responda “pode seguir” para publicá-lo como você pediu; depois informarei o repositório, o pull request, a prévia e a verificação do endpoint ao vivo.',
  pl: 'Builder ukończył i zweryfikował pracę w swojej prywatnej piaskownicy. Nic jej jeszcze nie opuściło: nie ma repozytorium, pull requesta, scalenia ani wdrożenia. Odpowiedz „dalej”, aby opublikować ją tak, jak prosiłeś; potem przekażę repozytorium, pull request, podgląd i sprawdzenie działającego endpointu.',
  ru: 'Builder завершил и проверил работу в своей закрытой песочнице. Ничего ещё не вышло наружу: нет ни репозитория, ни pull request, ни слияния, ни развёртывания. Ответьте «давай», чтобы опубликовать всё так, как вы просили; затем я сообщу репозиторий, pull request, превью и проверку работающего endpoint.',
  de: 'Builder hat die Arbeit in seiner privaten Sandbox abgeschlossen und geprüft. Noch hat nichts sie verlassen: kein Repository, kein Pull Request, kein Merge, kein Deployment. Antworten Sie „los“, um es wie gewünscht zu veröffentlichen; danach melde ich Repository, Pull Request, Vorschau und die Prüfung des Live-Endpunkts.',
  fr: 'Builder a terminé et vérifié le travail dans son bac à sable privé. Rien n’en est encore sorti : ni dépôt, ni pull request, ni fusion, ni déploiement. Répondez « vas-y » pour le publier comme vous l’avez demandé ; je vous indiquerai ensuite le dépôt, la pull request, l’aperçu et la vérification de l’endpoint en ligne.',
  it: 'Builder ha completato e verificato il lavoro nella sua sandbox privata. Non ne è ancora uscito nulla: nessun repository, pull request, merge o deployment. Rispondi «vai» per pubblicarlo come hai chiesto; poi ti indicherò repository, pull request, anteprima e verifica dell’endpoint attivo.',
  ja: 'Builder は非公開のサンドボックスで作業を完了し、検証しました。まだ何も外に出ていません（リポジトリ、プルリクエスト、マージ、デプロイはまだです）。ご依頼どおり公開するには「進めて」と返信してください。その後、リポジトリ、プルリクエスト、プレビュー、稼働中のエンドポイントの確認結果をお知らせします。',
  ko: 'Builder가 비공개 샌드박스에서 작업을 마치고 검증했습니다. 아직 아무것도 밖으로 나가지 않았습니다(저장소, 풀 리퀘스트, 병합, 배포 없음). 요청하신 대로 게시하려면 “진행해”라고 답해 주세요. 그 후 저장소, 풀 리퀘스트, 미리보기, 실제 엔드포인트 확인 결과를 알려 드리겠습니다.',
  ar: 'أنهى Builder العمل وتحقق منه في بيئته المعزولة الخاصة. لم يخرج منها أي شيء بعد: لا مستودع ولا طلب سحب ولا دمج ولا نشر. أجب بـ «تابع» لنشره كما طلبت؛ وبعدها سأبلغك بالمستودع وطلب السحب والمعاينة ونتيجة فحص نقطة النهاية الحية.',
}

export const COLLABORATE_APPROVAL_STARTED: Copy = {
  en: 'Approved. Builder is publishing the verified work now: repository, pull request, preview and live endpoint check.',
  es: 'Aprobado. Builder está publicando ahora el trabajo verificado: repositorio, pull request, vista previa y comprobación del endpoint en vivo.',
  pt: 'Aprovado. O Builder está publicando agora o trabalho verificado: repositório, pull request, prévia e verificação do endpoint ao vivo.',
  pl: 'Zatwierdzone. Builder publikuje teraz zweryfikowaną pracę: repozytorium, pull request, podgląd i sprawdzenie działającego endpointu.',
  ru: 'Одобрено. Builder публикует проверенную работу: репозиторий, pull request, превью и проверку работающего endpoint.',
  de: 'Genehmigt. Builder veröffentlicht jetzt die geprüfte Arbeit: Repository, Pull Request, Vorschau und Prüfung des Live-Endpunkts.',
  fr: 'Approuvé. Builder publie maintenant le travail vérifié : dépôt, pull request, aperçu et vérification de l’endpoint en ligne.',
  it: 'Approvato. Builder sta pubblicando ora il lavoro verificato: repository, pull request, anteprima e verifica dell’endpoint attivo.',
  ja: '承認しました。Builder が検証済みの作業を公開しています（リポジトリ、プルリクエスト、プレビュー、稼働中のエンドポイントの確認）。',
  ko: '승인되었습니다. Builder가 검증된 작업을 지금 게시하고 있습니다(저장소, 풀 리퀘스트, 미리보기, 실제 엔드포인트 확인).',
  ar: 'تمت الموافقة. يقوم Builder الآن بنشر العمل الذي تم التحقق منه: المستودع وطلب السحب والمعاينة وفحص نقطة النهاية الحية.',
}

export const COLLABORATE_SOURCE_CHANGED: Copy = {
  en: 'The project files changed after Builder verified them, so I did not publish. Ask Builder to verify the current files again first.',
  es: 'Los archivos del proyecto cambiaron después de que Builder los verificara, así que no publiqué nada. Pide primero a Builder que vuelva a verificar los archivos actuales.',
  pt: 'Os arquivos do projeto mudaram depois que o Builder os verificou, então não publiquei. Peça primeiro ao Builder para verificar novamente os arquivos atuais.',
  pl: 'Pliki projektu zmieniły się po ich weryfikacji przez Buildera, więc niczego nie opublikowałem. Najpierw poproś Buildera o ponowną weryfikację bieżących plików.',
  ru: 'Файлы проекта изменились после проверки Builder, поэтому я ничего не опубликовал. Сначала попросите Builder заново проверить текущие файлы.',
  de: 'Die Projektdateien haben sich nach der Prüfung durch Builder geändert, daher habe ich nichts veröffentlicht. Lassen Sie Builder zuerst die aktuellen Dateien erneut prüfen.',
  fr: 'Les fichiers du projet ont changé après leur vérification par Builder ; je n’ai donc rien publié. Demandez d’abord à Builder de revérifier les fichiers actuels.',
  it: 'I file del progetto sono cambiati dopo la verifica di Builder, quindi non ho pubblicato nulla. Chiedi prima a Builder di verificare di nuovo i file attuali.',
  ja: 'Builder が検証した後にプロジェクトのファイルが変更されたため、公開しませんでした。まず現在のファイルを Builder に再検証させてください。',
  ko: 'Builder가 검증한 후 프로젝트 파일이 변경되어 게시하지 않았습니다. 먼저 Builder에게 현재 파일을 다시 검증하도록 요청해 주세요.',
  ar: 'تغيّرت ملفات المشروع بعد أن تحقق منها Builder، لذلك لم أنشر شيئًا. اطلب من Builder أولًا التحقق من الملفات الحالية مرة أخرى.',
}

/** Owner repository repair in Work with me: the pull request is created but not merged. */
export const COLLABORATE_MERGE_HELD: Copy = {
  en: 'You are in Work with me mode, so I did not merge it. Review the pull request, then reply “go” to let the governed merge proceed (it still waits for GitHub checks and the safety checks), or merge it yourself on GitHub.',
  es: 'Estás en el modo Trabajemos juntos, así que no lo fusioné. Revisa el pull request y responde «adelante» para que siga la fusión gobernada (aún espera las comprobaciones de GitHub y las de seguridad), o fusiónalo tú en GitHub.',
  pt: 'Você está no modo Trabalhe comigo, então não fiz o merge. Revise o pull request e responda “pode seguir” para liberar o merge governado (ele ainda aguarda as verificações do GitHub e as de segurança), ou faça o merge você mesmo no GitHub.',
  pl: 'Jesteś w trybie Pracuj ze mną, więc go nie scaliłem. Przejrzyj pull request i odpowiedz „dalej”, aby zezwolić na nadzorowane scalenie (nadal czeka ono na kontrole GitHuba i kontrole bezpieczeństwa), albo scal go sam na GitHubie.',
  ru: 'Вы в режиме «Работаем вместе», поэтому я не выполнил слияние. Просмотрите pull request и ответьте «давай», чтобы разрешить контролируемое слияние (оно всё равно дождётся проверок GitHub и проверок безопасности), или выполните слияние сами на GitHub.',
  de: 'Sie sind im Modus „Mit mir arbeiten“, daher habe ich nicht gemergt. Prüfen Sie den Pull Request und antworten Sie „los“, um den kontrollierten Merge freizugeben (er wartet weiterhin auf die GitHub- und Sicherheitsprüfungen), oder mergen Sie ihn selbst auf GitHub.',
  fr: 'Vous êtes en mode Travaillons ensemble ; je n’ai donc pas fusionné. Relisez la pull request, puis répondez « vas-y » pour laisser la fusion encadrée se poursuivre (elle attend toujours les vérifications GitHub et de sécurité), ou fusionnez-la vous-même sur GitHub.',
  it: 'Sei nella modalità Lavoriamo insieme, quindi non ho eseguito il merge. Rivedi la pull request e rispondi «vai» per consentire il merge controllato (attende comunque i controlli di GitHub e di sicurezza), oppure eseguilo tu su GitHub.',
  ja: '「一緒に作業」モードのため、マージしていません。プルリクエストを確認し、「進めて」と返信すると管理されたマージが進みます（GitHub と安全性のチェックは引き続き必要です）。または GitHub でご自身でマージしてください。',
  ko: '“함께 작업” 모드이므로 병합하지 않았습니다. 풀 리퀘스트를 검토한 뒤 “진행해”라고 답하면 관리형 병합이 진행됩니다(GitHub 및 안전 검사는 여전히 필요합니다). 또는 GitHub에서 직접 병합해 주세요.',
  ar: 'أنت في وضع «اعمل معي»، لذلك لم أدمجه. راجع طلب السحب ثم أجب بـ «تابع» للسماح بالدمج الخاضع للضوابط (سيظل ينتظر فحوص GitHub وفحوص الأمان)، أو ادمجه بنفسك على GitHub.',
}

/** Owner's "go" on a held live-site repair: the hold is released to the governed merge continuation. */
export const COLLABORATE_MERGE_RELEASED: Copy = {
  en: 'Approved. I released the hold on the pull request. The governed merge now proceeds on its own once GitHub checks pass and the safety checks clear; Builder reports success only after the merged commit is proven healthy in Production.',
  es: 'Aprobado. Liberé la retención del pull request. La fusión gobernada continúa sola cuando pasen las comprobaciones de GitHub y las de seguridad; Builder solo informará éxito cuando el commit fusionado esté comprobado en Producción.',
  pt: 'Aprovado. Liberei a retenção do pull request. O merge governado prossegue sozinho quando as verificações do GitHub passarem e as de segurança forem aprovadas; o Builder só relata sucesso depois que o commit mesclado for comprovado em Produção.',
  pl: 'Zatwierdzone. Zdjąłem blokadę z pull requesta. Nadzorowane scalenie nastąpi samo, gdy przejdą kontrole GitHuba i kontrole bezpieczeństwa; Builder zgłosi sukces dopiero, gdy scalony commit zostanie potwierdzony w Produkcji.',
  ru: 'Одобрено. Я снял удержание с pull request. Контролируемое слияние выполнится само, когда пройдут проверки GitHub и проверки безопасности; Builder сообщит об успехе только после подтверждения слитого коммита в Production.',
  de: 'Genehmigt. Ich habe die Sperre des Pull Requests aufgehoben. Der kontrollierte Merge läuft von selbst, sobald die GitHub- und Sicherheitsprüfungen bestanden sind; Builder meldet Erfolg erst, wenn der gemergte Commit in Production als gesund nachgewiesen ist.',
  fr: 'Approuvé. J’ai levé le blocage de la pull request. La fusion encadrée se fera d’elle-même dès que les vérifications GitHub et de sécurité seront validées ; Builder ne signalera le succès qu’une fois le commit fusionné vérifié en Production.',
  it: 'Approvato. Ho rimosso il blocco dalla pull request. Il merge controllato procede da solo quando i controlli di GitHub e di sicurezza vengono superati; Builder segnala il successo solo dopo che il commit unito è verificato in Produzione.',
  ja: '承認しました。プルリクエストの保留を解除しました。GitHub と安全性のチェックに合格すると管理されたマージが自動で進み、マージされたコミットが本番で正常と確認されてから Builder が成功を報告します。',
  ko: '승인되었습니다. 풀 리퀘스트의 보류를 해제했습니다. GitHub 및 안전 검사를 통과하면 관리형 병합이 자동으로 진행되며, 병합된 커밋이 프로덕션에서 정상으로 확인된 후에만 Builder가 성공을 보고합니다.',
  ar: 'تمت الموافقة. رفعتُ التعليق عن طلب السحب. سيتم الدمج الخاضع للضوابط تلقائيًا بعد اجتياز فحوص GitHub وفحوص الأمان، ولن يُبلغ Builder بالنجاح إلا بعد التحقق من سلامة الالتزام المدمج في بيئة الإنتاج.',
}

/** Owner's "go" while automatic merging is switched off: nothing can merge on its own, so say so. */
export const COLLABORATE_MERGE_AUTOMERGE_OFF: Copy = {
  en: 'Automatic merging is switched off on this platform, so I cannot merge it for you. The pull request is ready: merge it on GitHub.',
  es: 'La fusión automática está desactivada en esta plataforma, así que no puedo fusionarlo por ti. El pull request está listo: fusiónalo en GitHub.',
  pt: 'O merge automático está desativado nesta plataforma, então não posso fazer o merge por você. O pull request está pronto: faça o merge no GitHub.',
  pl: 'Automatyczne scalanie jest wyłączone na tej platformie, więc nie mogę go scalić za Ciebie. Pull request jest gotowy: scal go na GitHubie.',
  ru: 'Автоматическое слияние на этой платформе отключено, поэтому я не могу выполнить его за вас. Pull request готов: выполните слияние на GitHub.',
  de: 'Automatisches Mergen ist auf dieser Plattform ausgeschaltet, daher kann ich es nicht für Sie mergen. Der Pull Request ist bereit: mergen Sie ihn auf GitHub.',
  fr: 'La fusion automatique est désactivée sur cette plateforme ; je ne peux donc pas fusionner pour vous. La pull request est prête : fusionnez-la sur GitHub.',
  it: 'Il merge automatico è disattivato su questa piattaforma, quindi non posso eseguirlo per te. La pull request è pronta: esegui il merge su GitHub.',
  ja: 'このプラットフォームでは自動マージがオフのため、代わりにマージできません。プルリクエストは準備できています。GitHub でマージしてください。',
  ko: '이 플랫폼에서는 자동 병합이 꺼져 있어 대신 병합할 수 없습니다. 풀 리퀘스트가 준비되었으니 GitHub에서 병합해 주세요.',
  ar: 'الدمج التلقائي متوقف على هذه المنصة، لذلك لا يمكنني دمجه نيابةً عنك. طلب السحب جاهز: ادمجه على GitHub.',
}

// ── The visible approval request (2026-10-22, owner: "the only way I knew to say go was because you told me so") ──
// A paused job records `awaitingApproval: { action }` on its result; every chat shows it as a card with a button that
// sends the approval word in the user's language, so nobody needs to know a magic word.
export type ApprovalAction = 'isolated_publication' | 'repository_merge'
export type PendingApproval = Readonly<{ action: ApprovalAction }>

export function readPendingApproval(payload: unknown): PendingApproval | null {
  const action = (payload as { awaitingApproval?: { action?: unknown } } | null)?.awaitingApproval?.action
  return action === 'isolated_publication' || action === 'repository_merge' ? { action } : null
}

/** What the approve button sends: a whole-message approval accepted by isAssistanceApproval. */
export const APPROVAL_WORD: Copy = { en: 'go', es: 'adelante', pt: 'pode seguir', pl: 'dalej', ru: 'давай', de: 'los', fr: 'vas-y', it: 'vai', ja: '進めて', ko: '진행해', ar: 'تابع' }

export const APPROVAL_TITLE: Copy = { en: 'Waiting for your approval', es: 'Esperando tu aprobación', pt: 'Aguardando sua aprovação', pl: 'Czeka na Twoją zgodę', ru: 'Ожидает вашего одобрения', de: 'Wartet auf Ihre Freigabe', fr: 'En attente de votre approbation', it: 'In attesa della tua approvazione', ja: 'あなたの承認を待っています', ko: '승인을 기다리는 중', ar: 'بانتظار موافقتك' }

export const APPROVAL_BODY: Readonly<Record<ApprovalAction, Copy>> = {
  isolated_publication: {
    en: 'The work is verified in the private sandbox and nothing has left it. Approving creates the repository, opens and merges the pull request, deploys the preview and checks the live endpoint.',
    es: 'El trabajo está verificado en el entorno privado y nada ha salido de él. Al aprobar se crea el repositorio, se abre y fusiona el pull request, se despliega la vista previa y se comprueba el endpoint en vivo.',
    pt: 'O trabalho está verificado no ambiente privado e nada saiu dele. Ao aprovar, o repositório é criado, o pull request é aberto e mesclado, a prévia é implantada e o endpoint ao vivo é verificado.',
    pl: 'Praca jest zweryfikowana w prywatnej piaskownicy i nic jej nie opuściło. Zatwierdzenie utworzy repozytorium, otworzy i scali pull request, wdroży podgląd i sprawdzi działający endpoint.',
    ru: 'Работа проверена в закрытой песочнице, и ничего не вышло наружу. Одобрение создаст репозиторий, откроет и сольёт pull request, развернёт превью и проверит работающий endpoint.',
    de: 'Die Arbeit ist in der privaten Sandbox geprüft, und nichts hat sie verlassen. Mit der Freigabe werden das Repository erstellt, der Pull Request geöffnet und gemergt, die Vorschau bereitgestellt und der Live-Endpunkt geprüft.',
    fr: 'Le travail est vérifié dans le bac à sable privé et rien n’en est sorti. L’approbation crée le dépôt, ouvre et fusionne la pull request, déploie l’aperçu et vérifie l’endpoint en ligne.',
    it: 'Il lavoro è verificato nella sandbox privata e non ne è uscito nulla. Approvando si crea il repository, si apre e si unisce la pull request, si distribuisce l’anteprima e si verifica l’endpoint attivo.',
    ja: '作業は非公開のサンドボックスで検証済みで、まだ何も外に出ていません。承認すると、リポジトリの作成、プルリクエストの作成とマージ、プレビューのデプロイ、稼働中のエンドポイントの確認を行います。',
    ko: '작업은 비공개 샌드박스에서 검증되었으며 아직 아무것도 밖으로 나가지 않았습니다. 승인하면 저장소를 만들고, 풀 리퀘스트를 열어 병합하고, 미리보기를 배포하고, 실제 엔드포인트를 확인합니다.',
    ar: 'تم التحقق من العمل في البيئة المعزولة الخاصة ولم يخرج منها أي شيء. بالموافقة يُنشأ المستودع ويُفتح طلب السحب ويُدمج وتُنشر المعاينة ويُفحص نقطة النهاية الحية.',
  },
  repository_merge: {
    en: 'The fix is in a pull request that has not been merged. Approving releases it to the governed merge, which still waits for GitHub checks and the safety checks, then proves the result in Production.',
    es: 'La corrección está en un pull request que no se ha fusionado. Al aprobar se libera a la fusión gobernada, que aún espera las comprobaciones de GitHub y de seguridad, y luego verifica el resultado en Producción.',
    pt: 'A correção está em um pull request que não foi mesclado. Ao aprovar, ele é liberado para o merge governado, que ainda aguarda as verificações do GitHub e de segurança e depois comprova o resultado em Produção.',
    pl: 'Poprawka jest w pull requeście, który nie został scalony. Zatwierdzenie przekaże go do nadzorowanego scalenia, które nadal czeka na kontrole GitHuba i bezpieczeństwa, a potem potwierdzi wynik w Produkcji.',
    ru: 'Исправление находится в pull request, который ещё не слит. Одобрение передаст его контролируемому слиянию, которое всё равно дождётся проверок GitHub и безопасности, а затем подтвердит результат в Production.',
    de: 'Die Korrektur liegt in einem Pull Request, der noch nicht gemergt ist. Mit der Freigabe geht er an den kontrollierten Merge, der weiterhin auf GitHub- und Sicherheitsprüfungen wartet und das Ergebnis dann in Production nachweist.',
    fr: 'Le correctif se trouve dans une pull request non fusionnée. L’approbation la confie à la fusion encadrée, qui attend toujours les vérifications GitHub et de sécurité, puis vérifie le résultat en Production.',
    it: 'La correzione è in una pull request non ancora unita. Approvando la si affida al merge controllato, che attende comunque i controlli di GitHub e di sicurezza e poi verifica il risultato in Produzione.',
    ja: '修正はまだマージされていないプルリクエストにあります。承認すると管理されたマージに引き渡され、GitHub と安全性のチェックを待ってから本番で結果を確認します。',
    ko: '수정 사항은 아직 병합되지 않은 풀 리퀘스트에 있습니다. 승인하면 관리형 병합으로 넘어가며, GitHub 및 안전 검사를 기다린 뒤 프로덕션에서 결과를 확인합니다.',
    ar: 'الإصلاح موجود في طلب سحب لم يُدمج بعد. بالموافقة يُحال إلى الدمج الخاضع للضوابط، الذي سيظل ينتظر فحوص GitHub وفحوص الأمان، ثم يتحقق من النتيجة في بيئة الإنتاج.',
  },
}

export const APPROVAL_BUTTON: Readonly<Record<ApprovalAction, Copy>> = {
  isolated_publication: { en: 'Approve and publish', es: 'Aprobar y publicar', pt: 'Aprovar e publicar', pl: 'Zatwierdź i opublikuj', ru: 'Одобрить и опубликовать', de: 'Freigeben und veröffentlichen', fr: 'Approuver et publier', it: 'Approva e pubblica', ja: '承認して公開', ko: '승인하고 게시', ar: 'موافقة ونشر' },
  repository_merge: { en: 'Approve the merge', es: 'Aprobar la fusión', pt: 'Aprovar o merge', pl: 'Zatwierdź scalenie', ru: 'Одобрить слияние', de: 'Merge freigeben', fr: 'Approuver la fusion', it: 'Approva il merge', ja: 'マージを承認', ko: '병합 승인', ar: 'الموافقة على الدمج' },
}

/** Under the button: the same approval can be typed. {word} is APPROVAL_WORD in that language. */
export const APPROVAL_HINT: Copy = { en: 'Or reply “{word}”.', es: 'O responde «{word}».', pt: 'Ou responda “{word}”.', pl: 'Lub odpowiedz „{word}”.', ru: 'Или ответьте «{word}».', de: 'Oder antworten Sie „{word}“.', fr: 'Ou répondez « {word} ».', it: 'Oppure rispondi «{word}».', ja: '「{word}」と返信しても承認できます。', ko: '또는 “{word}”라고 답해도 됩니다.', ar: 'أو أجب بـ «{word}».' }

// What a person reads when a Builder V2 job ends, in their language and without internal terms. Production
// 2026-10-22: replies read "Builder V2 verified the workspace with recorded host test execution" or ended with a raw
// code such as builder_v2_continuation_no_progress; the owner: "the users do not care what the Builder does in the
// background, they want results". The exact failure code stays in the job's error column for diagnosis.
export const BUILDER_RESULT_DONE: Copy = {
  en: 'Done. Your project is built and every check I ran passed. Download the files below.',
  es: 'Listo. Tu proyecto está creado y todas las comprobaciones que ejecuté pasaron. Descarga los archivos abajo.',
  pt: 'Pronto. Seu projeto foi criado e todas as verificações que executei passaram. Baixe os arquivos abaixo.',
  pl: 'Gotowe. Projekt jest zbudowany i wszystkie uruchomione przeze mnie sprawdzenia przeszły. Pobierz pliki poniżej.',
  ru: 'Готово. Проект создан, и все запущенные мной проверки пройдены. Скачайте файлы ниже.',
  de: 'Fertig. Ihr Projekt ist erstellt und alle von mir ausgeführten Prüfungen waren erfolgreich. Laden Sie die Dateien unten herunter.',
  fr: 'Terminé. Votre projet est créé et toutes les vérifications que j’ai lancées ont réussi. Téléchargez les fichiers ci-dessous.',
  it: 'Fatto. Il progetto è pronto e tutti i controlli che ho eseguito sono riusciti. Scarica i file qui sotto.',
  ja: '完了しました。プロジェクトが作成され、実行したすべてのチェックに合格しました。下のファイルをダウンロードしてください。',
  ko: '완료했습니다. 프로젝트가 만들어졌고 실행한 모든 검사를 통과했습니다. 아래에서 파일을 내려받으세요.',
  ar: 'تم. أُنشئ مشروعك ونجحت كل الفحوصات التي شغّلتها. نزّل الملفات أدناه.',
}

export const BUILDER_RESULT_SYNTAX_ONLY: Copy = {
  en: 'Your code is written and has no syntax errors, but it was not run, so it is not yet proven to work.',
  es: 'Tu código está escrito y no tiene errores de sintaxis, pero no se ejecutó, así que aún no está comprobado que funcione.',
  pt: 'Seu código foi escrito e não tem erros de sintaxe, mas não foi executado, então ainda não está comprovado que funciona.',
  pl: 'Kod jest napisany i nie ma błędów składni, ale nie został uruchomiony, więc nie potwierdzono jeszcze, że działa.',
  ru: 'Код написан и не содержит синтаксических ошибок, но он не запускался, поэтому его работа ещё не подтверждена.',
  de: 'Ihr Code ist geschrieben und frei von Syntaxfehlern, wurde aber nicht ausgeführt; dass er funktioniert, ist noch nicht belegt.',
  fr: 'Votre code est écrit et ne contient pas d’erreur de syntaxe, mais il n’a pas été exécuté : son bon fonctionnement n’est pas encore prouvé.',
  it: 'Il codice è scritto e non ha errori di sintassi, ma non è stato eseguito, quindi non è ancora dimostrato che funzioni.',
  ja: 'コードは作成され、構文エラーはありません。ただし実行していないため、動作はまだ確認されていません。',
  ko: '코드는 작성되었고 구문 오류는 없지만, 실행하지 않았기 때문에 동작은 아직 확인되지 않았습니다.',
  ar: 'كُتبت الشيفرة ولا توجد بها أخطاء في الصياغة، لكنها لم تُشغَّل، لذلك لم يثبت بعد أنها تعمل.',
}

export const BUILDER_RESULT_NOT_FINISHED: Copy = {
  en: 'I could not finish this. What was done so far is saved below. Ask me to continue, or describe the result you want in more detail.',
  es: 'No pude terminar esto. Lo hecho hasta ahora está guardado abajo. Pídeme que continúe o describe con más detalle el resultado que quieres.',
  pt: 'Não consegui terminar isto. O que foi feito até agora está salvo abaixo. Peça para eu continuar ou descreva com mais detalhes o resultado que você quer.',
  pl: 'Nie udało mi się tego dokończyć. Dotychczasowa praca jest zapisana poniżej. Poproś mnie o kontynuację albo opisz dokładniej oczekiwany wynik.',
  ru: 'Мне не удалось это закончить. Уже сделанное сохранено ниже. Попросите меня продолжить или опишите нужный результат подробнее.',
  de: 'Ich konnte das nicht abschließen. Das bisher Erledigte ist unten gespeichert. Bitten Sie mich weiterzumachen oder beschreiben Sie das gewünschte Ergebnis genauer.',
  fr: 'Je n’ai pas pu terminer. Ce qui a été fait est enregistré ci-dessous. Demandez-moi de continuer ou décrivez plus précisément le résultat souhaité.',
  it: 'Non sono riuscito a completarlo. Quanto fatto finora è salvato qui sotto. Chiedimi di continuare o descrivi meglio il risultato che vuoi.',
  ja: '完了できませんでした。ここまでの作業は下に保存されています。続行を依頼するか、求める結果をもう少し詳しく教えてください。',
  ko: '이 작업을 끝내지 못했습니다. 지금까지 한 작업은 아래에 저장되어 있습니다. 계속하라고 요청하시거나 원하는 결과를 더 자세히 설명해 주세요.',
  ar: 'لم أتمكن من إنهاء هذا. ما أُنجز حتى الآن محفوظ أدناه. اطلب مني المتابعة أو صف النتيجة التي تريدها بتفصيل أكثر.',
}

export const BUILDER_RESULT_STALLED: Copy = {
  en: 'I stopped because I was not making progress. What was done so far is saved below. Tell me more about what you want built and I will try again.',
  es: 'Me detuve porque no estaba avanzando. Lo hecho hasta ahora está guardado abajo. Cuéntame más sobre lo que quieres construir y lo intentaré de nuevo.',
  pt: 'Parei porque não estava avançando. O que foi feito até agora está salvo abaixo. Conte mais sobre o que você quer construir e tentarei de novo.',
  pl: 'Zatrzymałem się, bo praca nie postępowała. Dotychczasowa praca jest zapisana poniżej. Opisz dokładniej, co mam zbudować, a spróbuję ponownie.',
  ru: 'Я остановился, потому что работа не продвигалась. Уже сделанное сохранено ниже. Расскажите подробнее, что нужно создать, и я попробую снова.',
  de: 'Ich habe angehalten, weil ich nicht vorankam. Das bisher Erledigte ist unten gespeichert. Beschreiben Sie genauer, was entstehen soll, dann versuche ich es erneut.',
  fr: 'Je me suis arrêté car je n’avançais plus. Ce qui a été fait est enregistré ci-dessous. Dites-m’en plus sur ce que vous voulez créer et je réessaierai.',
  it: 'Mi sono fermato perché non stavo facendo progressi. Quanto fatto finora è salvato qui sotto. Dimmi di più su cosa vuoi costruire e riproverò.',
  ja: '作業が進まなかったため停止しました。ここまでの作業は下に保存されています。作りたいものをもう少し詳しく教えていただければ、もう一度試します。',
  ko: '진전이 없어 작업을 멈췄습니다. 지금까지 한 작업은 아래에 저장되어 있습니다. 만들고 싶은 것을 더 자세히 알려 주시면 다시 시도하겠습니다.',
  ar: 'توقفت لأنني لم أكن أحرز تقدمًا. ما أُنجز حتى الآن محفوظ أدناه. أخبرني بالمزيد عما تريد بناءه وسأحاول مجددًا.',
}

export const BUILDER_RESULT_CONTINUING: Copy = {
  en: 'Still working. Progress is saved and I will continue automatically.',
  es: 'Sigo trabajando. El progreso está guardado y continuaré automáticamente.',
  pt: 'Ainda trabalhando. O progresso está salvo e continuarei automaticamente.',
  pl: 'Nadal pracuję. Postęp jest zapisany i będę kontynuować automatycznie.',
  ru: 'Работа продолжается. Прогресс сохранён, я продолжу автоматически.',
  de: 'Ich arbeite noch. Der Fortschritt ist gespeichert und ich mache automatisch weiter.',
  fr: 'Toujours en cours. La progression est enregistrée et je continuerai automatiquement.',
  it: 'Sto ancora lavorando. I progressi sono salvati e continuerò automaticamente.',
  ja: '作業中です。進捗は保存されており、自動的に続行します。',
  ko: '아직 작업 중입니다. 진행 상황이 저장되었으며 자동으로 계속합니다.',
  ar: 'ما زلت أعمل. التقدم محفوظ وسأتابع تلقائيًا.',
}

// While a Builder job runs. Production 2026-10-23: "COS Builder is running job … Progress and the final result are
// durable in History; the action will not be replayed." The job id stays in the response data, not the sentence.
export const BUILDER_RUNNING: Copy = {
  en: 'I’m working on your project. Progress and the finished result will appear in this conversation automatically.',
  es: 'Estoy en ello. Puedes salir de esta página; el resultado aparecerá en el Historial.',
  pt: 'Estou cuidando disso. Você pode sair desta página; o resultado aparecerá no Histórico.',
  pl: 'Zajmuję się tym. Możesz opuścić tę stronę; wynik pojawi się w Historii.',
  ru: 'Уже работаю. Можно уйти с этой страницы — результат появится в Истории.',
  de: 'Ich kümmere mich darum. Sie können diese Seite verlassen; das Ergebnis erscheint im Verlauf.',
  fr: 'Je m’en occupe. Vous pouvez quitter cette page ; le résultat apparaîtra dans l’Historique.',
  it: 'Ci sto lavorando. Puoi lasciare questa pagina; il risultato apparirà nella Cronologia.',
  ja: '対応中です。このページを離れても大丈夫です。結果は履歴に表示されます。',
  ko: '작업 중입니다. 이 페이지를 떠나셔도 됩니다. 결과는 기록에 표시됩니다.',
  ar: 'أعمل على ذلك. يمكنك مغادرة هذه الصفحة؛ ستظهر النتيجة في السجل.',
}

// A chat answer still being prepared after the browser request ended.
export const COS_TURN_ACCEPTED: Copy = {
  en: 'Got it. I’m working on your answer; it will appear here and in History.',
  es: 'Entendido. Estoy preparando tu respuesta; aparecerá aquí y en el Historial.',
  pt: 'Entendi. Estou preparando sua resposta; ela aparecerá aqui e no Histórico.',
  pl: 'Rozumiem. Przygotowuję odpowiedź; pojawi się tutaj i w Historii.',
  ru: 'Понял. Готовлю ответ — он появится здесь и в Истории.',
  de: 'Verstanden. Ich arbeite an Ihrer Antwort; sie erscheint hier und im Verlauf.',
  fr: 'Compris. Je prépare votre réponse ; elle apparaîtra ici et dans l’Historique.',
  it: 'Ricevuto. Sto preparando la risposta; apparirà qui e nella Cronologia.',
  ja: '承知しました。回答を準備しています。ここと履歴に表示されます。',
  ko: '알겠습니다. 답변을 준비하고 있습니다. 여기와 기록에 표시됩니다.',
  ar: 'تم. أُعدّ إجابتك الآن؛ ستظهر هنا وفي السجل.',
}
