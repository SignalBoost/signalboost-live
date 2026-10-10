// saas/app/request-plan/page.tsx
'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import { supabase } from '@/utils/supabase/client'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
type Source = 'website_optimizer' | 'repo_check' | 'cybersecurity_check' | 'audit_preview'

type Copy = {
  back: string
  badge: string
  title: string
  body: string
  signedInTitle: string
  signedInBody: string
  safe: string
  source: string
  targetUrl: string
  company: string
  optional: string
  continue: string
  pricing: string
  note: string
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
  options: Record<Source, string>
}

const COPY: Record<Lang, Copy> = {
  en: {
    back: uiText('generatedUi.u_85647deec9865df5'),
    badge: uiText('generatedUi.u_298a9207a732a11d'),
    title: uiText('generatedUi.u_6355c7c1bd1fe92c'),
    body: uiText('generatedUi.u_e7537dc059c3458d'),
    signedInTitle: uiText('generatedUi.u_c3f291ae4fe4776c'),
    signedInBody: uiText('generatedUi.u_178a017a6edec75a'),
    safe: uiText('generatedUi.u_5a47e8e668406538'),
    source: uiText('generatedUi.u_9b41efae340c46c7'),
    targetUrl: uiText('generatedUi.u_b5a9404423a3f5ea'),
    company: uiText('generatedUi.u_de4743c879734dc3'),
    optional: uiText('generatedUi.u_ec91fdd9256cb75a'),
    continue: uiText('generatedUi.u_fdb09f83be950afc'),
    pricing: uiText('generatedUi.u_434dc3a581a65a52'),
    note: uiText('generatedUi.u_90c6387f50e3f25b'),
    name: uiText('generatedUi.u_2c6b2e253c01fb2e'),
    email: uiText('generatedUi.u_932f815786ae75ab'),
    submit: uiText('generatedUi.u_4a92b2561177dfe6'),
    submitting: uiText('generatedUi.u_5d1fa38bcf0d88ca'),
    successTitle: uiText('generatedUi.u_eb840f9a77a557b8'),
    successBody: uiText('generatedUi.u_21fc0682825bbf4a'),
    saved: uiText('generatedUi.u_5742f592ac63282f'),
    queued: uiText('generatedUi.u_7db417fdeea6e106'),
    notSaved: uiText('generatedUi.u_0e0d544e458d50d6'),
    missing: uiText('generatedUi.u_3799c5bf2515bba8'),
    error: uiText('generatedUi.u_65227385c356ea00'),
    options: { website_optimizer: uiText('generatedUi.u_7c0cbab9b791858b'), repo_check: uiText('generatedUi.u_870d4209c4350829'), cybersecurity_check: uiText('generatedUi.u_ed915f985534a061'), audit_preview: uiText('generatedUi.u_bfde463a8a1587f3') },
  },
  es: {
    back: PUBLIC_BRAND.name,
    badge: 'Siguiente paso',
    title: `Continúa en ${PUBLIC_BRAND.name} para corregir esto.`,
    body: `La herramienta pública gratuita ya mostró la señal. Para corregir el problema o convertirlo en un flujo completo de mejora, continúa a ${PUBLIC_BRAND.name} y regístrate como cualquier otro cliente.`,
    signedInTitle: 'Envía esto directamente a tu cola.',
    signedInBody: 'Ya has iniciado sesión, así que no hay nada que registrar. Al enviarlo, el resultado entra en el flujo de Marketing + Ventas para revisión del propietario.',
    safe: 'Sin email automático, sin seguimiento oculto y sin cambios sin aprobación.',
    source: 'Herramienta usada',
    targetUrl: 'Sitio o repo revisado',
    company: 'Empresa',
    optional: 'opcional',
    continue: `Continuar a ${PUBLIC_BRAND.name}`,
    pricing: 'Ver precios',
    note: 'La información de la empresa es opcional. Solo ayuda a mantener claro el contexto al continuar.',
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
    options: { website_optimizer: 'Optimizador Web', repo_check: 'Repo / Auditoría', cybersecurity_check: 'Revisión de Ciberseguridad', audit_preview: 'Vista de Auditoría' },
  },
  pt: {
    back: PUBLIC_BRAND.name,
    badge: 'Próximo passo',
    title: `Continue no ${PUBLIC_BRAND.name} para corrigir isso.`,
    body: `A ferramenta pública gratuita já mostrou o sinal. Para corrigir o problema ou transformá-lo em um fluxo completo de melhoria, continue para o ${PUBLIC_BRAND.name} e cadastre-se como qualquer outro cliente.`,
    signedInTitle: 'Envie isto direto para a sua fila.',
    signedInBody: 'Você já está conectado, então não há nada para cadastrar. Ao enviar, o resultado entra no fluxo de Marketing + Vendas para revisão do proprietário.',
    safe: 'Sem email automático, sem follow-up oculto e sem mudanças sem aprovação.',
    source: 'Ferramenta usada',
    targetUrl: 'Site ou repo verificado',
    company: 'Empresa',
    optional: 'opcional',
    continue: `Continuar para o ${PUBLIC_BRAND.name}`,
    pricing: 'Ver preços',
    note: 'A informação da empresa é opcional. Ela apenas ajuda a manter o contexto claro ao continuar.',
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
    options: { website_optimizer: 'Otimizador de Site', repo_check: 'Repo / Auditoria', cybersecurity_check: 'Verificação de Cibersegurança', audit_preview: 'Prévia de Auditoria' },
  },
  pl: {
    back: PUBLIC_BRAND.name,
    badge: 'Następny krok',
    title: `Kontynuuj w ${PUBLIC_BRAND.name}, aby to naprawić.`,
    body: `Darmowe publiczne narzędzie pokazało już sygnał. Aby naprawić problem albo zmienić go w pełny workflow ulepszeń, przejdź do ${PUBLIC_BRAND.name} i zarejestruj się jak każdy klient.`,
    signedInTitle: 'Wyślij to prosto do swojej kolejki.',
    signedInBody: 'Masz już zalogowaną sesję, więc nie trzeba się rejestrować. Wysłanie umieszcza wynik w workflow Marketing + Sprzedaż do przeglądu właściciela.',
    safe: 'Bez automatycznego emaila, ukrytego follow-up i zmian bez akceptacji.',
    source: 'Użyte narzędzie',
    targetUrl: 'Sprawdzona strona lub repo',
    company: 'Firma',
    optional: 'opcjonalnie',
    continue: `Kontynuuj do ${PUBLIC_BRAND.name}`,
    pricing: 'Zobacz ceny',
    note: 'Informacja o firmie jest opcjonalna. Pomaga tylko zachować jasny kontekst po przejściu dalej.',
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
    options: { website_optimizer: 'Optymalizator Strony', repo_check: 'Repo / Audyt', cybersecurity_check: 'Test Cyberbezpieczeństwa', audit_preview: 'Podgląd Audytu' },
  },
  ru: {
    back: PUBLIC_BRAND.name,
    badge: 'Следующий шаг',
    title: `Продолжите в ${PUBLIC_BRAND.name}, чтобы это исправить.`,
    body: `Бесплатный публичный инструмент уже показал сигнал. Чтобы исправить проблему или превратить её в полный workflow улучшений, перейдите в ${PUBLIC_BRAND.name} и зарегистрируйтесь как обычный клиент.`,
    signedInTitle: 'Отправьте это сразу в свою очередь.',
    signedInBody: 'Вы уже вошли в систему, поэтому регистрация не нужна. Отправка помещает результат в workflow Marketing + Sales для проверки владельцем.',
    safe: 'Без автоматического email, скрытого follow-up и изменений без утверждения.',
    source: 'Использованный инструмент',
    targetUrl: 'Проверенный сайт или repo',
    company: 'Компания',
    optional: 'необязательно',
    continue: `Продолжить в ${PUBLIC_BRAND.name}`,
    pricing: 'Посмотреть цены',
    note: 'Информация о компании необязательна. Она только помогает сохранить контекст при продолжении.',
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
    options: { website_optimizer: 'Website Optimizer', repo_check: 'Repo / Audit Check', cybersecurity_check: 'Cybersecurity Check', audit_preview: 'Audit Preview' },
  },
  de: {
    back: 'SignalBoost',
    badge: 'Nächster Schritt',
    title: 'Fahren Sie in SignalBoost fort, um dies zu beheben.',
    body: 'Das kostenlose öffentliche Tool hat das Signal bereits gezeigt. Um das Problem beheben zu lassen oder in einen vollständigen Verbesserungs-Workflow zu überführen, fahren Sie mit SignalBoost fort und registrieren Sie sich wie jeder andere Kunde.',
    signedInTitle: 'Senden Sie dies direkt an Ihre Warteschlange.',
    signedInBody: 'Sie sind bereits angemeldet, eine Registrierung ist also nicht nötig. Durch das Absenden gelangt das Ergebnis zur Prüfung durch den Inhaber in den Marketing + Sales-Workflow.',
    safe: 'Keine automatischen E-Mails, keine versteckten Nachfassaktionen und keine Änderungen ohne Genehmigung.',
    source: 'Verwendetes Tool',
    targetUrl: 'Website oder Repository geprüft',
    company: 'Unternehmen',
    optional: 'optional',
    continue: 'Weiter zu SignalBoost',
    pricing: 'Preise ansehen',
    note: 'Firmenangaben sind optional. Sie helfen nur, den Kontext klar zu halten, wenn Sie fortfahren.',
    name: 'Ihr Name',
    email: 'Geschäftliche E-Mail',
    submit: 'Verbesserungsplan anfordern',
    submitting: 'Wird vorbereitet…',
    successTitle: 'Lead-Erfassung erstellt',
    successBody: 'Die Anfrage ist jetzt bereit zur Prüfung durch den Inhaber im Marketing + Sales-Workflow.',
    saved: 'In der Inhaber-Warteschlange gespeichert',
    queued: 'Genehmigung durch Inhaber ausstehend',
    notSaved: 'Vorbereitet, aber noch nicht in der Inhaber-Warteschlange gespeichert',
    missing: 'Bitte füllen Sie die Pflichtfelder aus.',
    error: 'Diese Anfrage konnte nicht erstellt werden.',
    options: { website_optimizer: 'Website-Optimierer', repo_check: 'Repo- / Audit-Prüfung', cybersecurity_check: 'Cybersicherheitsprüfung', audit_preview: 'Audit-Vorschau' },
  },
  fr: {
    back: 'SignalBoost',
    badge: 'Étape suivante',
    title: 'Continuez dans SignalBoost pour corriger ce problème.',
    body: 'L’outil public gratuit a déjà révélé le signal. Pour faire corriger le problème ou le transformer en workflow d’amélioration complet, continuez vers SignalBoost et inscrivez-vous comme n’importe quel autre client.',
    signedInTitle: 'Envoyez ceci directement dans votre file d’attente.',
    signedInBody: 'Vous êtes déjà connecté, il n’y a donc rien à créer. En envoyant ce formulaire, le résultat est transmis au workflow Marketing + Ventes pour examen par le propriétaire.',
    safe: 'Aucun e-mail automatique, aucune relance cachée et aucune modification sans approbation.',
    source: 'Outil utilisé',
    targetUrl: 'Site web ou dépôt vérifié',
    company: 'Entreprise',
    optional: 'facultatif',
    continue: 'Continuer vers SignalBoost',
    pricing: 'Voir les tarifs',
    note: 'Les informations sur l\'entreprise sont facultatives. Elles aident seulement à garder le contexte clair lorsque vous continuez.',
    name: 'Votre nom',
    email: 'E-mail professionnel',
    submit: 'Demander un plan d’amélioration',
    submitting: 'Préparation…',
    successTitle: 'Saisie de lead créée',
    successBody: 'La demande est maintenant prête pour examen par le propriétaire dans le workflow Marketing + Ventes.',
    saved: 'Enregistré dans la file du propriétaire',
    queued: 'En attente d’approbation du propriétaire',
    notSaved: 'Préparé, mais pas encore enregistré dans la file du propriétaire',
    missing: 'Veuillez remplir les champs obligatoires.',
    error: 'Impossible de créer cette demande.',
    options: { website_optimizer: 'Optimiseur de site web', repo_check: 'Vérification dépôt / audit', cybersecurity_check: 'Contrôle de cybersécurité', audit_preview: 'Aperçu de l’audit' },
  },
  it: {
    back: 'SignalBoost',
    badge: 'Passaggio successivo',
    title: 'Continua in SignalBoost per risolvere il problema.',
    body: 'Lo strumento pubblico gratuito ha già mostrato il segnale. Per far risolvere il problema o trasformarlo in un flusso di miglioramento completo, prosegui su SignalBoost e registrati come qualsiasi altro cliente.',
    signedInTitle: 'Invia questo direttamente alla tua coda.',
    signedInBody: 'Hai già effettuato l’accesso, quindi non c’è nulla a cui registrarsi. Inviando, il risultato entra nel flusso Marketing + Vendite per la revisione del proprietario.',
    safe: 'Nessuna email automatica, nessun follow-up nascosto e nessuna modifica senza approvazione.',
    source: 'Strumento utilizzato',
    targetUrl: 'Sito web o repository verificato',
    company: 'Azienda',
    optional: 'facoltativo',
    continue: 'Continua su SignalBoost',
    pricing: 'Vedi prezzi',
    note: 'Le informazioni sull\'azienda sono facoltative. Servono solo a mantenere chiaro il contesto quando prosegui.',
    name: 'Il tuo nome',
    email: 'Email di lavoro',
    submit: 'Richiedi piano di miglioramento',
    submitting: 'Preparazione…',
    successTitle: 'Acquisizione lead creata',
    successBody: 'La richiesta è ora pronta per la revisione del proprietario nel flusso Marketing + Vendite.',
    saved: 'Salvato nella coda del proprietario',
    queued: 'In attesa di approvazione del proprietario',
    notSaved: 'Preparato, ma non ancora salvato nella coda del proprietario',
    missing: 'Compila i campi obbligatori.',
    error: 'Impossibile creare questa richiesta.',
    options: { website_optimizer: 'Ottimizzatore di siti web', repo_check: 'Controllo repository / audit', cybersecurity_check: 'Controllo di cybersicurezza', audit_preview: 'Anteprima audit' },
  },
  ja: {
    back: 'SignalBoost',
    badge: '次のステップ',
    title: 'これを修正するには SignalBoost で続行してください。',
    body: '無料の公開ツールですでにシグナルが示されています。問題を修正したり、本格的な改善ワークフローにつなげたりするには、SignalBoost に進み、他のお客様と同様にサインアップしてください。',
    signedInTitle: 'これをキューに直接送信します。',
    signedInBody: 'すでにサインインしているため、登録は不要です。送信すると、結果はオーナーのレビュー用にマーケティング＋セールスのワークフローに追加されます。',
    safe: '自動メールなし、隠れたフォローアップなし、承認なしの変更なし。',
    source: '使用ツール',
    targetUrl: '確認済みのウェブサイトまたはリポジトリ',
    company: '会社',
    optional: '任意',
    continue: 'SignalBoost へ進む',
    pricing: '料金を見る',
    note: '会社情報は任意です。続行する際に文脈を明確に保つためだけに使用されます。',
    name: 'お名前',
    email: '勤務先メールアドレス',
    submit: '改善プランを依頼',
    submitting: '準備中…',
    successTitle: 'リード受付を作成しました',
    successBody: 'リクエストは、マーケティング＋セールスのワークフローでオーナーのレビューを受ける準備ができました。',
    saved: 'オーナーキューに保存しました',
    queued: 'オーナーの承認待ち',
    notSaved: '準備済みですが、まだオーナーキューに保存されていません',
    missing: '必須項目を入力してください。',
    error: 'このリクエストを作成できませんでした。',
    options: { website_optimizer: 'ウェブサイト最適化', repo_check: 'リポジトリ / 監査チェック', cybersecurity_check: 'サイバーセキュリティチェック', audit_preview: '監査プレビュー' },
  },
  ko: {
    back: 'SignalBoost',
    badge: '다음 단계',
    title: '이 문제를 해결하려면 SignalBoost에서 계속하세요.',
    body: '무료 공개 도구가 이미 신호를 보여 주었습니다. 문제를 해결하거나 전체 개선 워크플로로 전환하려면 SignalBoost로 이동하여 다른 고객과 마찬가지로 가입하세요.',
    signedInTitle: '이 항목을 대기열로 바로 보내세요.',
    signedInBody: '이미 로그인되어 있으므로 가입할 필요가 없습니다. 제출하면 결과가 소유자 검토를 위해 마케팅 + 영업 워크플로에 들어갑니다.',
    safe: '자동 이메일, 숨겨진 후속 조치, 승인 없는 변경이 없습니다.',
    source: '사용된 도구',
    targetUrl: '확인된 웹사이트 또는 저장소',
    company: '회사',
    optional: '선택 사항',
    continue: 'SignalBoost로 계속',
    pricing: '요금 보기',
    note: '회사 정보는 선택 사항입니다. 계속 진행할 때 맥락을 명확히 유지하는 데에만 도움이 됩니다.',
    name: '이름',
    email: '업무용 이메일',
    submit: '개선 계획 요청',
    submitting: '준비 중…',
    successTitle: '리드 접수가 생성됨',
    successBody: '이제 마케팅 + 영업 워크플로에서 소유자가 요청을 검토할 수 있습니다.',
    saved: '소유자 대기열에 저장됨',
    queued: '소유자 승인 대기 중',
    notSaved: '준비되었지만 아직 소유자 대기열에 저장되지 않았습니다',
    missing: '필수 항목을 입력하세요.',
    error: '이 요청을 생성할 수 없습니다.',
    options: { website_optimizer: '웹사이트 최적화 도구', repo_check: '저장소 / 감사 점검', cybersecurity_check: '사이버 보안 점검', audit_preview: '감사 미리보기' },
  },
  ar: {
    back: 'SignalBoost',
    badge: 'الخطوة التالية',
    title: 'تابع في SignalBoost لإصلاح هذا.',
    body: 'لقد أظهرت الأداة العامة المجانية الإشارة بالفعل. لإصلاح المشكلة أو تحويلها إلى سير عمل تحسين كامل، تابع إلى SignalBoost وسجّل مثل أي عميل آخر.',
    signedInTitle: 'أرسل هذا مباشرة إلى قائمة الانتظار لديك.',
    signedInBody: 'أنت مسجّل الدخول بالفعل، لذا لا يوجد ما تشترك فيه. يؤدي إرسال هذا إلى إدخال النتيجة في مسار عمل التسويق + المبيعات لمراجعة المالك.',
    safe: 'لا بريد إلكتروني تلقائي، ولا متابعة خفية، ولا تغييرات دون موافقة.',
    source: 'الأداة المستخدمة',
    targetUrl: 'تم فحص الموقع الإلكتروني أو المستودع',
    company: 'الشركة',
    optional: 'اختياري',
    continue: 'المتابعة إلى SignalBoost',
    pricing: 'عرض الأسعار',
    note: 'معلومات الشركة اختيارية. فهي تساعد فقط على إبقاء السياق واضحًا عند المتابعة.',
    name: 'اسمك',
    email: 'البريد الإلكتروني للعمل',
    submit: 'طلب خطة تحسين',
    submitting: 'جارٍ التحضير…',
    successTitle: 'تم إنشاء استقبال العميل المحتمل',
    successBody: 'أصبح الطلب الآن جاهزًا لمراجعة المالك في مسار عمل التسويق + المبيعات.',
    saved: 'تم الحفظ في قائمة المالك',
    queued: 'بانتظار موافقة المالك',
    notSaved: 'تم التحضير، لكن لم يُحفظ في قائمة انتظار المالك بعد',
    missing: 'يُرجى إكمال الحقول المطلوبة.',
    error: 'تعذّر إنشاء هذا الطلب.',
    options: { website_optimizer: 'مُحسِّن المواقع الإلكترونية', repo_check: 'فحص المستودع / التدقيق', cybersecurity_check: 'فحص الأمن السيبراني', audit_preview: 'معاينة التدقيق' },
  },
}

function activeLang(lang: string): Lang {
  return (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang
}

function sourceFromQuery(value: string | null): Source {
  return value === 'repo_check' || value === 'cybersecurity_check' || value === 'audit_preview' ? value : 'website_optimizer'
}

function toCosLocale(lang: Lang) { return lang === 'pt' ? 'pt-BR' : lang }

export default function RequestPlanPage() {
  const { lang } = useI18n()
  const langCode = activeLang(lang)
  const copy = COPY[langCode]
  const [source, setSource] = useState<Source>('website_optimizer')
  const [targetUrl, setTargetUrl] = useState('')
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [signedIn, setSignedIn] = useState(false)

  // A signed-in visitor should never be told to sign up. Their session email is
  // prefilled so the intake lands under the account they already have.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const sessionEmail = data?.user?.email
      if (!sessionEmail) return
      setSignedIn(true)
      setEmail(current => current.trim() || sessionEmail)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSource(sourceFromQuery(params.get('source')))
    const target = params.get('target')
    if (target) setTargetUrl(target)
  }, [])

  // The public tools are lead magnets: the request must reach the COS Marketing + Sales
  // engine as an owner-review record. Writing browser state alone loses the lead.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !targetUrl.trim()) { setError(copy.missing); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/public/lead-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, targetUrl, name, email, company, locale: toCosLocale(langCode), tags: ['public-lead-magnet'] }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.ok) { setError(typeof json?.error === 'string' ? json.error : copy.error); return }
      setResult(json.intake)
    } catch {
      setError(copy.error)
    } finally {
      setLoading(false)
    }
  }

  function continueToPlatform() {
    if (typeof window !== 'undefined') window.location.href = '/dashboard'
  }

  const saved = Boolean(result?.storage?.saved)

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-semibold text-cyan-200 hover:text-white">← {copy.back}</Link>
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/4 p-8 shadow-2xl shadow-cyan-950/30">
          <span className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">{copy.badge}</span>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-white md:text-5xl">{signedIn ? copy.signedInTitle : copy.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{signedIn ? copy.signedInBody : copy.body}</p>
          <p className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-semibold text-cyan-50">{copy.safe}</p>

          <form onSubmit={submit} className="mt-8 grid gap-4">
            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.source}</span>
              <select value={source} onChange={event => setSource(event.target.value as Source)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-hidden ring-cyan-300/20 focus:ring-4">
                <option value="website_optimizer">{copy.options.website_optimizer}</option>
                <option value="repo_check">{copy.options.repo_check}</option>
                <option value="cybersecurity_check">{copy.options.cybersecurity_check}</option>
                <option value="audit_preview">{copy.options.audit_preview}</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.targetUrl}</span>
              <input value={targetUrl} onChange={event => setTargetUrl(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-hidden ring-cyan-300/20 focus:ring-4" />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.company} <span className="font-normal text-slate-500">({copy.optional})</span></span>
              <input value={company} onChange={event => setCompany(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-hidden ring-cyan-300/20 focus:ring-4" />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.name} <span className="font-normal text-slate-500">({copy.optional})</span></span>
              <input value={name} onChange={event => setName(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-hidden ring-cyan-300/20 focus:ring-4" />
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-200">
              <span>{copy.email}</span>
              <input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-hidden ring-cyan-300/20 focus:ring-4" />
            </label>

            <p className="text-sm leading-6 text-slate-400">{copy.note}</p>

            {error ? <p className="rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm font-semibold text-red-100">{error}</p> : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={loading} className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">{loading ? copy.submitting : copy.submit}</button>
              <button type="button" onClick={continueToPlatform} className="rounded-xl border border-white/10 px-5 py-3 text-center font-black text-white transition hover:border-cyan-300/50 hover:text-cyan-100">{copy.continue}</button>
              <Link href="/pricing" className="rounded-xl border border-white/10 px-5 py-3 text-center font-black text-white transition hover:border-cyan-300/50 hover:text-cyan-100">{copy.pricing}</Link>
            </div>
          </form>

          {result ? (
            <section className="mt-8 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-6">
              <h2 className="text-2xl font-black text-white">{copy.successTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-cyan-50/80">{copy.successBody}</p>
              <p className="mt-4 text-sm font-bold text-cyan-100">{saved ? copy.saved : copy.notSaved}</p>
              <p className="mt-1 text-xs text-cyan-50/70">{copy.queued}</p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  )
}
