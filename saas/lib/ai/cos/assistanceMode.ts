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
  en: 'You are in Work with me mode, so I did not merge it. Review the pull request and merge it on GitHub when you are satisfied.',
  es: 'Estás en el modo Trabajemos juntos, así que no lo fusioné. Revisa el pull request y fusiónalo en GitHub cuando estés conforme.',
  pt: 'Você está no modo Trabalhe comigo, então não fiz o merge. Revise o pull request e faça o merge no GitHub quando estiver satisfeito.',
  pl: 'Jesteś w trybie Pracuj ze mną, więc go nie scaliłem. Przejrzyj pull request i scal go na GitHubie, gdy będziesz zadowolony.',
  ru: 'Вы в режиме «Работаем вместе», поэтому я не выполнил слияние. Просмотрите pull request и выполните слияние на GitHub, когда будете довольны.',
  de: 'Sie sind im Modus „Mit mir arbeiten“, daher habe ich nicht gemergt. Prüfen Sie den Pull Request und mergen Sie ihn auf GitHub, wenn Sie zufrieden sind.',
  fr: 'Vous êtes en mode Travaillons ensemble ; je n’ai donc pas fusionné. Relisez la pull request et fusionnez-la sur GitHub quand elle vous convient.',
  it: 'Sei nella modalità Lavoriamo insieme, quindi non ho eseguito il merge. Rivedi la pull request ed eseguine il merge su GitHub quando sei soddisfatto.',
  ja: '「一緒に作業」モードのため、マージしていません。プルリクエストを確認し、問題なければ GitHub でマージしてください。',
  ko: '“함께 작업” 모드이므로 병합하지 않았습니다. 풀 리퀘스트를 검토한 뒤 만족하시면 GitHub에서 병합해 주세요.',
  ar: 'أنت في وضع «اعمل معي»، لذلك لم أدمجه. راجع طلب السحب وادمجه على GitHub عندما تكون راضيًا.',
}
