'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  REVIEW_LOCALES,
  analyzeReviewSentiment,
  buildModerationSuggestion,
  buildTestimonialCampaign,
  formatReviewCurrency,
  formatReviewDate,
  getFlagForLocale,
  getLocaleLabel,
  getSentimentBadge,
  normalizeReviewLocale,
  reviewMatchesModerationFlag,
  sortReviews,
  summarizeLocaleTelemetry,
  summarizeSentimentTrend,
  type ReviewLocale,
  type ReviewSortMode,
  type ReviewSentiment,
} from '@/lib/reviews'
import { uiText } from '@/lib/i18n/uiText'
import { PUBLIC_BRAND } from '@/lib/public-brand'

const GREEN = '#4ade80'
const RED = '#f87171'
const CYAN = '#1af0ff'
const GOLD = '#ffc300'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
const COPY: Record<string, Record<Lang, string>> = {
  kicker:           { en: uiText('generatedUi.u_eff4a1c2d650ac94'), es: 'Centro de mando de reseñas', pt: 'Central de avaliações', pl: 'Centrum zarządzania opiniami', ru: 'Центр управления отзывами', de: 'Kommandozentrale für Bewertungen', fr: 'Centre de commande des avis', it: 'Centro di comando recensioni', ja: 'レビューコマンドセンター', ko: '리뷰 명령 센터', ar: 'مركز قيادة المراجعات' },
  title:            { en: uiText('generatedUi.u_4637016c5e82d0d1'), es: 'Colector de reseñas', pt: 'Coletor de avaliações', pl: 'Kolektor opinii', ru: 'Сборщик отзывов', de: 'Bewertungssammler', fr: 'Collecteur d’avis', it: 'Raccoglitore di recensioni', ja: 'レビュー収集', ko: '리뷰 수집기', ar: 'جامع المراجعات' },
  subtitle:         { en: uiText('generatedUi.u_360580113dbe96ab'), es: 'Recopila reseñas multilingües, aprueba lo que se publica y monitorea el sentimiento.', pt: 'Colete avaliações multilíngues, aprove o que publica e monitore sentimentos.', pl: 'Zbieraj wielojęzyczne opinie, zatwierdzaj publikacje i monitoruj nastroje.', ru: 'Собирайте многоязычные отзывы, одобряйте публикации и отслеживайте настроения.', de: 'Sammeln Sie mehrsprachige Bewertungen, genehmigen Sie, was veröffentlicht wird, und überwachen Sie die Stimmung.', fr: 'Collectez des avis multilingues, approuvez ce qui est publié et surveillez le sentiment.', it: 'Raccogli recensioni multilingue, approva ciò che viene pubblicato e monitora il sentiment.', ja: '多言語のレビューを収集し、公開内容を承認して、評判を監視します。', ko: '다국어 리뷰를 수집하고, 게시할 내용을 승인하며, 감성을 모니터링하세요.', ar: 'اجمع مراجعات متعددة اللغات، ووافق على ما يُنشر، وراقب المشاعر.' },
  shareCta:         { en: uiText('generatedUi.u_8410b494cae23dad'), es: 'Compartir enlace', pt: 'Compartilhar link', pl: 'Udostępnij link', ru: 'Поделиться ссылкой', de: 'Prüflink teilen', fr: 'Partager le lien de révision', it: 'Condividi link di revisione', ja: 'レビューリンクを共有', ko: '검토 링크 공유', ar: 'مشاركة رابط المراجعة' },
  adminCta:         { en: uiText('generatedUi.u_67838c7ad5459fc8'), es: 'Ver telemetría', pt: 'Ver telemetria', pl: 'Zobacz telemetrię', ru: 'Телеметрия', de: 'Telemetrie anzeigen', fr: 'Voir la télémétrie', it: 'Visualizza telemetria', ja: 'テレメトリを表示', ko: '원격 측정 보기', ar: 'عرض القياس عن بُعد' },
  sendLinkTitle:    { en: uiText('generatedUi.u_e6d4f5ce8a93bd73'), es: 'Envía este enlace a tus clientes', pt: 'Envie este link para seus clientes', pl: 'Wyślij ten link swoim klientom', ru: 'Отправьте эту ссылку своим клиентам', de: 'Senden Sie diesen Link an Ihre Kunden', fr: 'Envoyez ce lien à vos clients', it: 'Invia questo link ai tuoi clienti', ja: 'このリンクをお客様に送信してください', ko: '이 링크를 고객에게 보내세요', ar: 'أرسل هذا الرابط إلى عملائك' },
  submissionTitle:  { en: uiText('generatedUi.u_03329cf8efd5a913'), es: 'Envío de reseña localizada', pt: 'Envio de avaliação localizada', pl: 'Lokalizowane przesyłanie opinii', ru: 'Локализованная отправка отзыва', de: 'Lokalisierte Bewertungseinreichung', fr: 'Soumission d\'avis localisée', it: 'Invio di recensioni localizzate', ja: 'ローカライズされたレビュー投稿', ko: '현지화된 리뷰 제출', ar: 'إرسال مراجعات مترجمة محليًا' },
  sendLinkDesc:     { en: uiText('generatedUi.u_be9601f482f01cb7'), es: 'Hacen clic, dejan una reseña en su idioma, adjuntan imágenes y aparece como Pendiente.', pt: 'Eles clicam, deixam uma avaliação no seu idioma, anexam imagens e aparece como Pendente.', pl: 'Klikają, zostawiają opinię w swoim języku, dołączają zdjęcia — pojawia się jako Oczekująca.', ru: 'Они нажимают, оставляют отзыв на своём языке — он появляется как Ожидающий.', de: 'Sie klicken darauf, hinterlassen eine Bewertung in ihrer eigenen Sprache, hängen Bilder an, und die Bewertung erscheint bis zur Genehmigung als „Ausstehend“.', fr: 'Ils cliquent dessus, laissent un avis dans leur propre langue, joignent des images, et l’avis apparaît comme « En attente » jusqu’à son approbation.', it: 'Fanno clic, lasciano una recensione nella propria lingua, allegano immagini e la recensione appare come In attesa fino all’approvazione.', ja: 'クリックして自分の言語でレビューを書き、画像を添付すると、承認されるまで「保留中」として表示されます。', ko: '클릭해서 자신의 언어로 리뷰를 남기고 이미지를 첨부하면, 승인될 때까지 \'대기 중\'으로 표시됩니다.', ar: 'ينقرون عليه، ويتركون مراجعة بلغتهم، ويرفقون صورًا، فتظهر بحالة «قيد الانتظار» حتى تتم الموافقة عليها.' },
  loading:          { en: uiText('generatedUi.u_ba3bbbe10d8bef66'), es: 'Cargando…', pt: 'Carregando…', pl: 'Ładowanie…', ru: 'Загрузка…', de: 'Wird geladen…', fr: 'Chargement…', it: 'Caricamento…', ja: '読み込み中…', ko: '불러오는 중…', ar: 'جارٍ التحميل…' },
  pickHandleDesc:   { en: uiText('generatedUi.u_e9a31d81bf0a5910'), es: 'Elige un identificador — 3 a 30 letras minúsculas, dígitos y guiones.', pt: 'Escolha um identificador — 3 a 30 letras minúsculas, dígitos e hífens.', pl: 'Wybierz identyfikator — 3 do 30 małych liter, cyfr i myślników.', ru: 'Выберите идентификатор — 3–30 строчных букв, цифр и дефисов.', de: 'Wählen Sie einen Namen für Ihren Bewertungslink – 3 bis 30 Kleinbuchstaben, Ziffern und Bindestriche.', fr: 'Choisissez un identifiant pour votre lien d’avis — de 3 à 30 lettres minuscules, chiffres et tirets.', it: 'Scegli un identificativo per il tuo link alle recensioni: da 3 a 30 lettere minuscole, cifre e trattini.', ja: 'レビューリンクのハンドルを選択してください。小文字、数字、ハイフンで3～30文字です。', ko: '리뷰 링크에 사용할 핸들을 선택하세요. 소문자, 숫자, 하이픈으로 3~30자입니다.', ar: 'اختر معرّفًا لرابط التقييمات — من 3 إلى 30 حرفًا لاتينيًا صغيرًا وأرقامًا وشرطات.' },
  handlePlaceholder:{ en: uiText('generatedUi.u_957f19bade6f852b'), es: 'tu-identificador', pt: 'seu-identificador', pl: 'twoj-identyfikator', ru: 'ваш-идентификатор', de: 'ihr-handle', fr: 'votre-identifiant', it: 'tuo-handle', ja: 'your-handle', ko: 'your-handle', ar: 'your-handle' },
  saving:           { en: uiText('generatedUi.u_23e39291d6135814'), es: 'Guardando…', pt: 'Salvando…', pl: 'Zapisywanie…', ru: 'Сохранение…', de: 'Wird gespeichert…', fr: 'Enregistrement…', it: 'Salvataggio…', ja: '保存中…', ko: '저장 중…', ar: 'جارٍ الحفظ…' },
  claim:            { en: uiText('generatedUi.u_4ca41db028253700'), es: 'Reclamar', pt: 'Reivindicar', pl: 'Zarezerwuj', ru: 'Занять', de: 'Beanspruchen', fr: 'Revendiquer', it: 'Rivendica', ja: '申請', ko: '소유권 주장', ar: 'المطالبة' },
  copied:           { en: uiText('generatedUi.u_8d525e5f158b9afe'), es: 'Copiado', pt: 'Copiado', pl: 'Skopiowano', ru: 'Скопировано', de: 'Kopiert', fr: 'Copié', it: 'Copiato', ja: 'コピーしました', ko: '복사됨', ar: 'تم النسخ' },
  copyLink:         { en: uiText('generatedUi.u_dbf362d4f210c780'), es: 'Copiar enlace', pt: 'Copiar link', pl: 'Kopiuj link', ru: 'Копировать ссылку', de: 'Link kopieren', fr: 'Copier le lien', it: 'Copia link', ja: 'リンクをコピー', ko: '링크 복사', ar: 'نسخ الرابط' },
  openNewTab:       { en: uiText('generatedUi.u_e0af5c0bc2457475'), es: 'Abrir en nueva pestaña', pt: 'Abrir em nova aba', pl: 'Otwórz w nowej karcie', ru: 'Открыть в новой вкладке', de: 'In neuem Tab öffnen', fr: 'Ouvrir dans un nouvel onglet', it: 'Apri in una nuova scheda', ja: '新しいタブで開く', ko: '새 탭에서 열기', ar: 'فتح في علامة تبويب جديدة' },
  previewText:      { en: uiText('generatedUi.u_db1c141e18b2b208'), es: 'Ejemplo de cómo se muestra una reseña — fechas y montos se adaptan a cada idioma:', pt: 'Exemplo de como uma avaliação aparece — datas e valores se adaptam a cada idioma:', pl: 'Przykład wyświetlania opinii — daty i kwoty dostosowują się do języka:', ru: 'Пример отображения отзыва — даты и суммы адаптируются к языку:', de: 'Beispiel für die Anzeige einer Kundenbewertung – Datumsangaben und Beträge passen sich jeder Sprache an:', fr: 'Exemple d’affichage d’un avis client — les dates et les montants s’adaptent à chaque langue :', it: 'Esempio di visualizzazione di una recensione cliente: date e importi si adattano a ogni lingua:', ja: '顧客レビューの表示例 — 日付と金額は各言語に合わせて表示されます：', ko: '고객 리뷰 표시 예시 — 날짜와 금액은 각 언어에 맞게 조정됩니다:', ar: 'مثال على كيفية عرض تقييم العميل — تتكيّف التواريخ والمبالغ مع كل لغة:' },
  sampleBadge:      { en: uiText('generatedUi.u_39d399369a105e93'), es: 'Vista de ejemplo', pt: 'Prévia de exemplo', pl: 'Przykładowy podgląd', ru: 'Пример', de: 'Beispielvorschau', fr: 'Aperçu d’exemple', it: 'Anteprima di esempio', ja: 'サンプルプレビュー', ko: '샘플 미리 보기', ar: 'معاينة نموذجية' },
  mediaLabel:       { en: uiText('generatedUi.u_a194e248c04648f4'), es: 'Archivos de imagen opcionales', pt: 'Anexos de imagem opcionais', pl: 'Opcjonalne załączniki obrazów', ru: 'Необязательные вложения изображений', de: 'Optionale Bildanhänge', fr: 'Pièces jointes image facultatives', it: 'Allegati immagine facoltativi', ja: '画像の添付（任意）', ko: '이미지 첨부(선택 사항)', ar: 'مرفقات صور اختيارية' },
  conciergeTitle:   { en: uiText('generatedUi.u_bef4521095495dae'), es: 'Concierge IA', pt: 'Concierge IA', pl: 'Concierge AI', ru: 'Консьерж ИИ', de: 'Concierge-KI', fr: 'IA Concierge', it: 'AI Concierge', ja: 'コンシェルジュAI', ko: '컨시어지 AI', ar: 'الكونسيرج بالذكاء الاصطناعي' },
  conciergeHeadline:{ en: uiText('generatedUi.u_9e41a281f1dd39e9'), es: 'Recomendaciones basadas en reseñas', pt: 'Recomendações baseadas em avaliações', pl: 'Rekomendacje oparte na opiniach', ru: 'Рекомендации на основе отзывов', de: 'Bewertungsbasierte Empfehlungen', fr: 'Recommandations basées sur les avis', it: 'Consigli basati sulle recensioni', ja: 'レビューを考慮したおすすめ', ko: '리뷰 기반 추천', ar: 'توصيات مبنية على المراجعات' },
  conciergeBody:    { en: uiText('generatedUi.u_23d79449120cd467'), es: 'El Concierge sugiere acciones de moderación y propone campañas cuando el sentimiento es positivo.', pt: 'O Concierge sugere ações de moderação e propõe campanhas quando o sentimento é positivo.', pl: 'Concierge sugeruje działania moderacyjne i proponuje kampanie gdy nastroje są pozytywne.', ru: 'Консьерж предлагает действия модерации и кампании при позитивных настроениях.', de: 'Concierge schlägt Moderationsmaßnahmen vor und empfiehlt Kampagnen, wenn die Stimmung positiv ist.', fr: 'Concierge suggère des actions de modération et propose des campagnes lorsque le sentiment est positif.', it: 'Concierge suggerisce azioni di moderazione e propone campagne quando il sentiment è positivo.', ja: 'コンシェルジュはモデレーション操作を提案し、センチメントが良好な場合はキャンペーンを提案します。', ko: '컨시어지는 모더레이션 조치를 제안하고 감성이 긍정적일 때 캠페인을 제안합니다.', ar: 'يقترح الكونسيرج إجراءات إشراف ويقترح حملات عندما تكون المشاعر إيجابية.' },
  noCampaigns:      { en: uiText('generatedUi.u_d1bcf915c912b681'), es: 'Las reseñas positivas activarán ideas de campaña aquí.', pt: 'Avaliações positivas ativarão ideias de campanha aqui.', pl: 'Pozytywne opinie wyzwolą tutaj pomysły na kampanie.', ru: 'Положительные отзывы вызовут здесь идеи для кампаний.', de: 'Positive Bewertungen lösen hier Ideen für Testimonial-Kampagnen aus.', fr: 'Les avis positifs généreront ici des idées de campagnes de témoignages.', it: 'Le recensioni positive genereranno qui idee per campagne di testimonianze.', ja: '肯定的なレビューがあると、ここにお客様の声キャンペーンのアイデアが表示されます。', ko: '긍정적인 리뷰가 있으면 여기에 고객 추천 캠페인 아이디어가 생성됩니다.', ar: 'ستولّد التقييمات الإيجابية هنا أفكارًا لحملات الشهادات.' },
  yourReviews:      { en: uiText('generatedUi.u_d9058ab5c9016a86'), es: 'Tus reseñas', pt: 'Suas avaliações', pl: 'Twoje opinie', ru: 'Ваши отзывы', de: 'Ihre Bewertungen', fr: 'Vos avis', it: 'Le tue recensioni', ja: 'あなたのレビュー', ko: '내 리뷰', ar: 'تقييماتك' },
  summaryEmpty:     { en: uiText('generatedUi.u_13350f41a3451583'), es: 'Nada aún. Comparte el enlace de arriba para comenzar.', pt: 'Nada ainda. Compartilhe o link acima para começar.', pl: 'Jeszcze nic. Udostępnij powyższy link, aby rozpocząć.', ru: 'Пока ничего. Поделитесь ссылкой выше, чтобы начать.', de: 'Noch nichts vorhanden. Teilen Sie den Link oben, um zu beginnen.', fr: 'Rien pour l\'instant. Partagez le lien ci-dessus pour commencer.', it: 'Ancora niente. Condividi il link qui sopra per iniziare.', ja: 'まだ何もありません。開始するには上のリンクを共有してください。', ko: '아직 아무것도 없습니다. 시작하려면 위 링크를 공유하세요.', ar: 'لا شيء بعد. شارك الرابط أعلاه للبدء.' },
  total:            { en: uiText('generatedUi.u_11239872d178729a'), es: 'total', pt: 'total', pl: 'łącznie', ru: 'всего', de: 'gesamt', fr: 'total', it: 'totale', ja: '合計', ko: '합계', ar: 'الإجمالي' },
  pending:          { en: uiText('generatedUi.u_62a2fed3d6e08c44'), es: 'pendiente', pt: 'pendente', pl: 'oczekujące', ru: 'ожидающих', de: 'ausstehend', fr: 'en attente', it: 'in sospeso', ja: '保留中', ko: '대기 중', ar: 'قيد الانتظار' },
  approved:         { en: uiText('generatedUi.u_2687f86ed6784b8a'), es: 'aprobado', pt: 'aprovado', pl: 'zatwierdzone', ru: 'одобренных', de: 'genehmigt', fr: 'approuvé', it: 'approvato', ja: '承認済み', ko: '승인됨', ar: 'تمت الموافقة' },
  flagged:          { en: uiText('generatedUi.u_5588be887fb18a7d'), es: 'marcado', pt: 'sinalizado', pl: 'oflagowane', ru: 'отмеченных', de: 'markiert', fr: 'signalé', it: 'segnalato', ja: 'フラグ付き', ko: '신고됨', ar: 'معلَّم' },
  avg:              { en: uiText('generatedUi.u_ca5c8585b0760a76'), es: 'prom', pt: 'méd', pl: 'śr', ru: 'ср', de: 'Ø', fr: 'moy.', it: 'media', ja: '平均', ko: '평균', ar: 'المتوسط' },
  sortRelevance:    { en: uiText('generatedUi.u_8edc2f421465ed23'), es: 'Ordenar: relevancia', pt: 'Ordenar: relevância', pl: 'Sortuj: trafność', ru: 'Сортировка: релевантность', de: 'Sortieren: Relevanz', fr: 'Trier : pertinence', it: 'Ordina: pertinenza', ja: '並べ替え：関連度', ko: '정렬: 관련성', ar: 'الترتيب: الصلة' },
  sortDate:         { en: uiText('generatedUi.u_52a3d3605f7ac8aa'), es: 'Ordenar: más reciente', pt: 'Ordenar: más reciente', pl: 'Sortuj: najnowsze', ru: 'Сортировка: новейшие', de: 'Sortierung: neueste', fr: 'Tri : plus récents', it: 'Ordina: più recenti', ja: '並べ替え：新しい順', ko: '정렬: 최신순', ar: 'الترتيب: الأحدث' },
  sortRating:       { en: uiText('generatedUi.u_87eb14ddcee99d99'), es: 'Ordenar: calificación', pt: 'Ordenar: avaliação', pl: 'Sortuj: ocena', ru: 'Сортировка: рейтинг', de: 'Sortieren: Bewertung', fr: 'Trier : note', it: 'Ordina: valutazione', ja: '並べ替え: 評価', ko: '정렬: 평점', ar: 'الترتيب: التقييم' },
  allLanguages:     { en: uiText('generatedUi.u_acce3d0e30f951f6'), es: 'Todos los idiomas', pt: 'Todos os idiomas', pl: 'Wszystkie języki', ru: 'Все языки', de: 'Alle Sprachen', fr: 'Toutes les langues', it: 'Tutte le lingue', ja: 'すべての言語', ko: '모든 언어', ar: 'جميع اللغات' },
  allPartners:      { en: uiText('generatedUi.u_f1beb9d2a979e40b'), es: 'Todos los socios', pt: 'Todos os parceiros', pl: 'Wszyscy partnerzy', ru: 'Все партнёры', de: 'Alle Partner', fr: 'Tous les partenaires', it: 'Tutti i partner', ja: 'すべてのパートナー', ko: '모든 파트너', ar: 'جميع الشركاء' },
  allProducts:      { en: uiText('generatedUi.u_c4b20188433a8c23'), es: 'Todos los productos/servicios', pt: 'Todos os produtos/serviços', pl: 'Wszystkie produkty/usługi', ru: 'Все продукты/услуги', de: 'Alle Produkte/Dienstleistungen', fr: 'Tous les produits/services', it: 'Tutti i prodotti/servizi', ja: 'すべての製品/サービス', ko: '모든 제품/서비스', ar: 'جميع المنتجات/الخدمات' },
  filterAll:        { en: uiText('generatedUi.u_a52ace420f2175d0'), es: 'Todos', pt: 'Todos', pl: 'Wszystkie', ru: 'Все', de: 'Alle', fr: 'Tous', it: 'Tutti', ja: 'すべて', ko: '전체', ar: 'الكل' },
  filterPending:    { en: uiText('generatedUi.u_331551b0de4157c9'), es: 'Pendientes', pt: 'Pendentes', pl: 'Oczekujące', ru: 'Ожидающие', de: 'Ausstehend', fr: 'En attente', it: 'In sospeso', ja: '保留中', ko: '대기 중', ar: 'قيد الانتظار' },
  filterApproved:   { en: uiText('generatedUi.u_87b42e40c2a290e0'), es: 'Aprobados', pt: 'Aprovados', pl: 'Zatwierdzone', ru: 'Одобренные', de: 'Genehmigt', fr: 'Approuvé', it: 'Approvato', ja: '承認済み', ko: '승인됨', ar: 'تمت الموافقة' },
  filterFlagged:    { en: uiText('generatedUi.u_2f1978c6166e8980'), es: 'Marcados', pt: 'Sinalizados', pl: 'Oflagowane', ru: 'Отмеченные', de: 'Markiert', fr: 'Signalé', it: 'Segnalato', ja: 'フラグ付き', ko: '플래그 지정됨', ar: 'تم الإبلاغ عنه' },
  generalService:   { en: uiText('generatedUi.u_8f69f60e6baeefad'), es: 'Servicio general', pt: 'Serviço geral', pl: 'Usługa ogólna', ru: 'Общая услуга', de: 'Allgemeiner Dienst', fr: 'Service général', it: 'Servizio generale', ja: '一般サービス', ko: '일반 서비스', ar: 'خدمة عامة' },
  verifiedPartner:  { en: uiText('generatedUi.u_a38feefedc89c9bf'), es: 'Socio verificado', pt: 'Parceiro verificado', pl: 'Zweryfikowany partner', ru: 'Проверенный партнёр', de: 'Verifizierter Partner', fr: 'Partenaire vérifié', it: 'Partner verificato', ja: '認証済みパートナー', ko: '인증된 파트너', ar: 'شريك موثَّق' },
  media:            { en: uiText('generatedUi.u_721c9525ade2ea89'), es: 'medios', pt: 'mídia', pl: 'media', ru: 'медиа', de: 'Medien', fr: 'médias', it: 'media', ja: 'メディア', ko: '미디어', ar: 'الوسائط' },
  unpublish:        { en: uiText('generatedUi.u_2db04a54fa743150'), es: 'Despublicar', pt: 'Despublicar', pl: 'Cofnij publikację', ru: 'Снять с публикации', de: 'Veröffentlichung aufheben', fr: 'Dépublier', it: 'Annulla pubblicazione', ja: '公開を取り消す', ko: '게시 취소', ar: 'إلغاء النشر' },
  approve:          { en: uiText('generatedUi.u_6007acbe30b2cd98'), es: 'Aprobar', pt: 'Aprovar', pl: 'Zatwierdź', ru: 'Одобрить', de: 'Genehmigen', fr: 'Approuver', it: 'Approva', ja: '承認', ko: '승인', ar: 'موافقة' },
  unflag:           { en: uiText('generatedUi.u_eaf05d552ed6174f'), es: 'Quitar marca', pt: 'Remover sinalização', pl: 'Usuń flagę', ru: 'Снять отметку', de: 'Markierung entfernen', fr: 'Retirer le signalement', it: 'Rimuovi contrassegno', ja: 'フラグを解除', ko: '플래그 지우기', ar: 'إزالة العلامة' },
  flag:             { en: uiText('generatedUi.u_552127973f8424e1'), es: 'Marcar', pt: 'Sinalizar', pl: 'Oflaguj', ru: 'Отметить', de: 'Markieren', fr: 'Signaler', it: 'Segnala', ja: 'フラグを付ける', ko: '신고', ar: 'وضع علامة' },
  translate:        { en: uiText('generatedUi.u_bc4ac4d12a4a3f9c'), es: 'Traducir con IA', pt: 'Traduzir com IA', pl: 'Tłumacz AI', ru: 'ИИ-перевод', de: 'KI-Übersetzung', fr: 'Traduction IA', it: 'Traduzione AI', ja: 'AI翻訳', ko: 'AI 번역', ar: 'ترجمة بالذكاء الاصطناعي' },
  delete:           { en: uiText('generatedUi.u_e2d0a54968ead24e'), es: 'Eliminar', pt: 'Excluir', pl: 'Usuń', ru: 'Удалить', de: 'Löschen', fr: 'Supprimer', it: 'Elimina', ja: '削除', ko: '삭제', ar: 'حذف' },
  confirmDelete:    { en: uiText('generatedUi.u_3a14c8c6ad125718'), es: '¿Eliminar esta reseña? Esto no se puede deshacer.', pt: 'Excluir esta avaliação? Isso não pode ser desfeito.', pl: 'Usunąć tę opinię? Tego nie można cofnąć.', ru: 'Удалить этот отзыв? Это нельзя отменить.', de: 'Diese Bewertung löschen? Dies kann nicht rückgängig gemacht werden.', fr: 'Supprimer cet avis ? Cette action est irréversible.', it: 'Eliminare questa recensione? L’operazione non può essere annullata.', ja: 'このレビューを削除しますか？この操作は元に戻せません。', ko: '이 리뷰를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다.', ar: 'هل تريد حذف هذه المراجعة؟ لا يمكن التراجع عن ذلك.' },
  adminConsole:     { en: uiText('generatedUi.u_104bfb7a21182419'), es: 'Consola de Administrador', pt: 'Console do Administrador', pl: 'Konsola Administratora', ru: 'Консоль администратора', de: 'Admin-Konsole', fr: 'Console d\'administration', it: 'Console di amministrazione', ja: '管理コンソール', ko: '관리 콘솔', ar: 'وحدة تحكم المسؤول' },
  telemetryTitle:   { en: uiText('generatedUi.u_baae6a3ac96fe8d3'), es: 'Telemetría, sentimiento y moderación', pt: 'Telemetria, sentimento e moderação', pl: 'Telemetria, nastroje i moderacja', ru: 'Телеметрия, настроения и модерация', de: 'Prüft Telemetrie, Stimmung und Moderation', fr: 'Examine la télémétrie, le sentiment et la modération', it: 'Esamina telemetria, sentiment e moderazione', ja: 'テレメトリ、センチメント、モデレーションをレビュー', ko: '텔레메트리, 감성, 검토 내용 확인', ar: 'يراجع القياس عن بُعد والمشاعر والإشراف' },
  logsEnabled:      { en: uiText('generatedUi.u_b89a7e7556dc6188'), es: 'Envíos · Sentimiento IA · moderación', pt: 'Envios · Sentimento IA · moderação', pl: 'Zgłoszenia · Nastroje AI · moderacja', ru: 'Отправки · Настроения ИИ · модерация', de: 'Einreichungen · KI-Stimmungsanalyse · Moderation protokolliert', fr: 'Soumissions · Sentiment IA · Modération journalisée', it: 'Invii · Sentiment AI · Moderazione registrata', ja: '投稿 · AIセンチメント · モデレーション記録', ko: '제출 · AI 감성 · 검토 기록됨', ar: 'الإرسالات · مشاعر الذكاء الاصطناعي · الإشراف مُسجَّل' },
  localeVolume:     { en: uiText('generatedUi.u_2f8e24f4121d45cb'), es: 'Volumen por región', pt: 'Volume por região', pl: 'Wolumen według regionu', ru: 'Объём по регионам', de: 'Bewertungsvolumen pro Gebietsschema', fr: 'Volume d\'avis par paramètre régional', it: 'Volume di recensioni per locale', ja: 'ロケール別のレビュー件数', ko: '로캘별 리뷰 수', ar: 'حجم المراجعات لكل لغة/منطقة' },
  sentimentTrend:   { en: uiText('generatedUi.u_ae62485c8dc6c0ef'), es: 'Tendencia de sentimiento', pt: 'Tendência de sentimento', pl: 'Trend nastrojów', ru: 'Тенденция настроений', de: 'Stimmungsverlauf', fr: 'Tendance du sentiment', it: 'Andamento del sentiment', ja: 'センチメントの推移', ko: '감성 추이', ar: 'اتجاه المشاعر' },
  moderationQueue:  { en: uiText('generatedUi.u_50d92231eae4fdf6'), es: 'Cola de moderación', pt: 'Fila de moderação', pl: 'Kolejka moderacji', ru: 'Очередь moderacji', de: 'Moderationswarteschlange', fr: 'File de modération', it: 'Coda di moderazione', ja: 'モデレーションキュー', ko: '검토 대기열', ar: 'قائمة انتظار الإشراف' },
  outreachHooks:    { en: uiText('generatedUi.u_cc612cb152574dab'), es: 'Hooks Outreach + CRM', pt: 'Hooks Outreach + CRM', pl: 'Haki Outreach + CRM', ru: 'Хуки Outreach + CRM', de: 'Outreach + CRM-Hooks', fr: 'Prospection + hooks CRM', it: 'Outreach + hook CRM', ja: 'アウトリーチ + CRM フック', ko: '아웃리치 + CRM 훅', ar: 'التواصل + خطافات CRM' },
  crmRegression:    { en: uiText('generatedUi.u_0f692ee6380efb1d'), es: 'Guardia de regresión: reseñas positivas → Leads → Oportunidades → Conversiones.', pt: 'Guarda de regressão: avaliações positivas → Leads → Oportunidades → Conversões.', pl: 'Ochrona regresji: zatwierdzone opinie → Leady → Szanse → Konwersje.', ru: 'Защита регрессии: одобренные отзывы → Лиды → Возможности → Конверсии.', de: 'Regressionsschutz: Freigegebene positive Bewertungen werden Leads → Opportunities → Conversions zugeordnet.', fr: 'Garde-fou de régression : les avis positifs approuvés sont rattachés à Prospects → Opportunités → Conversions.', it: 'Protezione dalle regressioni: le recensioni positive approvate vengono associate a Lead → Opportunità → Conversioni.', ja: '回帰ガード: 承認済みの肯定的なレビューは見込み客 → 商談 → コンバージョンに紐付けられます。', ko: '회귀 방지: 승인된 긍정 리뷰는 리드 → 기회 → 전환에 연결됩니다.', ar: 'حماية من التراجع: تُرفَق المراجعات الإيجابية المعتمدة بـ العملاء المحتملين → الفرص → التحويلات.' },
  errSignIn:        { en: uiText('generatedUi.u_58e6d73e7af5aa17'), es: 'Por favor inicia sesión.', pt: 'Por favor faça login.', pl: 'Zaloguj się.', ru: 'Пожалуйста, войдите.', de: 'Bitte melden Sie sich an, um Ihre Bewertungen zu sehen.', fr: 'Veuillez vous connecter pour voir vos avis.', it: 'Accedi per vedere le tue recensioni.', ja: 'レビューを表示するにはサインインしてください。', ko: '리뷰를 보려면 로그인하세요.', ar: 'يرجى تسجيل الدخول لعرض مراجعاتك.' },
  errLoad:          { en: uiText('generatedUi.u_769bf34f0b1cc128'), es: 'No se pudieron cargar las reseñas.', pt: 'Não foi possível carregar as avaliações.', pl: 'Nie można załadować opinii.', ru: 'Не удалось загрузить отзывы.', de: 'Bewertungen konnten nicht geladen werden.', fr: 'Impossible de charger les avis.', it: 'Impossibile caricare le recensioni.', ja: 'レビューを読み込めませんでした。', ko: '리뷰를 불러올 수 없습니다.', ar: 'تعذّر تحميل المراجعات.' },
  errPickHandle:    { en: uiText('generatedUi.u_1e9091e22050fcad'), es: 'Elige un identificador para continuar.', pt: 'Escolha um identificador para continuar.', pl: 'Wybierz identyfikator.', ru: 'Выберите идентификатор.', de: 'Wählen Sie einen Handle, um fortzufahren.', fr: 'Choisissez un identifiant pour continuer.', it: 'Scegli un handle per continuare.', ja: '続行するにはハンドルを選択してください。', ko: '계속하려면 핸들을 선택하세요.', ar: 'اختر معرّفًا للمتابعة.' },
  errSaveHandle:    { en: uiText('generatedUi.u_a3c64e8773b22463'), es: 'No se pudo guardar el identificador.', pt: 'Não foi possível salvar o identificador.', pl: 'Nie można zapisać identyfikatora.', ru: 'Не удалось сохранить идентификатор.', de: 'Handle konnte nicht gespeichert werden.', fr: 'Impossible d’enregistrer l’identifiant.', it: 'Impossibile salvare l’handle.', ja: 'ハンドルを保存できませんでした。', ko: '핸들을 저장할 수 없습니다.', ar: 'تعذّر حفظ المعرّف.' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

const translationPreview: Record<ReviewLocale, string> = {
  en: 'AI translation is ready on demand in the selected workspace language.',
  es: 'La traducción con IA está lista bajo demanda en el idioma seleccionado.',
  pt: 'A tradução por IA está pronta sob demanda no idioma selecionado.',
  pl: 'Tłumaczenie AI jest dostępne na żądanie w wybranym języku.',
  ru: 'ИИ-перевод доступен по запросу на выбранном языке.',
  de: 'Die KI-Übersetzung ist bei Bedarf in der ausgewählten Arbeitsbereichssprache verfügbar.',
  fr: 'La traduction par IA est disponible à la demande dans la langue sélectionnée de l’espace de travail.',
  it: 'La traduzione AI è disponibile su richiesta nella lingua selezionata dello spazio di lavoro.',
  ja: 'AI 翻訳は、選択したワークスペース言語でいつでも利用できます。',
  ko: '선택한 워크스페이스 언어로 필요할 때 AI 번역을 사용할 수 있습니다.',
  ar: 'الترجمة بالذكاء الاصطناعي متاحة عند الطلب بلغة مساحة العمل المحددة.',
}

type Review = {
  id: string
  author_name: string
  author_email: string
  rating: number
  content: string
  language: string
  approved: boolean
  created_at: string
  sentiment?: ReviewSentiment
  verified_partner?: boolean
  partner_name?: string | null
  product_name?: string | null
  service_name?: string | null
  media_urls?: string[]
  flagged?: boolean
  moderation_status?: 'pending' | 'approved' | 'rejected' | 'flagged'
}

type SlugState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'set', slug: string }

export default function ReviewsPage() {
  const { lang } = useI18n()
  const activeLocale = normalizeReviewLocale(lang)
  const l = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en'

  const [isAdmin, setIsAdmin]               = useState(false)
  const [reviews, setReviews]               = useState<Review[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [reviewsError, setReviewsError]     = useState<string | null>(null)
  const [slug, setSlug]                     = useState<SlugState>({ kind: 'loading' })
  const [slugDraft, setSlugDraft]           = useState('')
  const [slugSaving, setSlugSaving]         = useState(false)
  const [slugError, setSlugError]           = useState<string | null>(null)
  const [copied, setCopied]                 = useState(false)
  const [statusFilter, setStatusFilter]     = useState<'all' | 'pending' | 'approved' | 'flagged'>('all')
  const [languageFilter, setLanguageFilter] = useState<'all' | ReviewLocale>('all')
  const [partnerFilter, setPartnerFilter]   = useState('all')
  const [productFilter, setProductFilter]   = useState('all')
  const [sortMode, setSortMode]             = useState<ReviewSortMode>('relevance')
  const [translatedReviewId, setTranslatedReviewId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d?.isAdmin) setIsAdmin(true) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/profile/slug')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (j?.slug) setSlug({ kind: 'set', slug: j.slug })
        else setSlug({ kind: 'none' })
      })
      .catch(() => { if (!cancelled) setSlug({ kind: 'none' }) })
    return () => { cancelled = true }
  }, [])

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true)
    setReviewsError(null)
    try {
      const res = await fetch('/api/reviews')
      if (res.status === 401) { setReviewsError(c('errSignIn', l)); setReviews([]); return }
      const j = await res.json()
      if (!res.ok) { setReviewsError(j?.error || c('errLoad', l)); setReviews([]); return }
      setReviews((j.reviews ?? []) as Review[])
    } catch {
      setReviewsError(c('errLoad', l))
      setReviews([])
    } finally {
      setReviewsLoading(false)
    }
  }, [l])

  useEffect(() => { loadReviews() }, [loadReviews])

  async function saveSlug() {
    const candidate = slugDraft.trim().toLowerCase()
    if (!candidate) { setSlugError(c('errPickHandle', l)); return }
    setSlugSaving(true); setSlugError(null)
    try {
      const res = await fetch('/api/profile/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: candidate }),
      })
      const j = await res.json()
      if (!res.ok) { setSlugError(j?.error || c('errSaveHandle', l)); return }
      setSlug({ kind: 'set', slug: j.slug })
      setSlugDraft('')
    } catch {
      setSlugError(c('errSaveHandle', l))
    } finally {
      setSlugSaving(false)
    }
  }

  async function patchReview(id: string, patch: Partial<Review>) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (!res.ok) loadReviews()
    } catch { loadReviews() }
  }

  async function deleteReview(id: string) {
    if (!confirm(c('confirmDelete', l))) return
    const snapshot = reviews
    setReviews(prev => prev.filter(r => r.id !== id))
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) setReviews(snapshot)
    } catch { setReviews(snapshot) }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const enrichedReviews = useMemo(() => reviews.map(review => {
    const sentiment = review.sentiment ?? analyzeReviewSentiment(review.content, review.rating)
    const flagged   = review.flagged || reviewMatchesModerationFlag(review.content)
    return {
      ...review,
      language: normalizeReviewLocale(review.language),
      sentiment, flagged,
      moderation_status: review.moderation_status ?? (flagged ? 'flagged' : review.approved ? 'approved' : 'pending'),
    }
  }), [reviews])

  const partners = Array.from(new Set(enrichedReviews.map(r => r.partner_name).filter(Boolean))) as string[]
  const products = Array.from(new Set(enrichedReviews.map(r => r.product_name || r.service_name).filter(Boolean))) as string[]

  const filteredReviews = enrichedReviews.filter(r => {
    if (statusFilter === 'pending'  && r.approved)  return false
    if (statusFilter === 'approved' && !r.approved) return false
    if (statusFilter === 'flagged'  && !r.flagged)  return false
    if (languageFilter !== 'all' && r.language !== languageFilter) return false
    if (partnerFilter  !== 'all' && r.partner_name !== partnerFilter) return false
    if (productFilter  !== 'all' && (r.product_name || r.service_name) !== productFilter) return false
    return true
  })

  const visibleReviews    = sortReviews(filteredReviews, sortMode)
  const approvedCount     = enrichedReviews.filter(r => r.approved).length
  const pendingCount      = enrichedReviews.length - approvedCount
  const flaggedCount      = enrichedReviews.filter(r => r.flagged).length
  const avgRating         = enrichedReviews.length ? enrichedReviews.reduce((s, r) => s + r.rating, 0) / enrichedReviews.length : 0
  const localeTelemetry   = summarizeLocaleTelemetry(enrichedReviews)
  const sentimentTrend    = summarizeSentimentTrend(enrichedReviews)
  const positiveCampaigns = enrichedReviews.filter(r => r.sentiment === 'positive' && r.rating >= 4).map(buildTestimonialCampaign).slice(0, 3)
  const reviewLink        = slug.kind === 'set' ? `${PUBLIC_BRAND.siteUrl}/review/${slug.slug}` : ''
  const summaryLine       = enrichedReviews.length === 0
    ? c('summaryEmpty', l)
    : `${enrichedReviews.length} ${c('total', l)} · ${pendingCount} ${c('pending', l)} · ${approvedCount} ${c('approved', l)} · ${flaggedCount} ${c('flagged', l)} · ${avgRating.toFixed(1)} ★ ${c('avg', l)}`

  return (
    <div className="sb-reviews-page" style={{ color: 'var(--text-primary)' }}>

      {/* ── Console header with live review telemetry ── */}
      <header className="sb-console" style={{ marginBottom: 0 }}>
        <div className="sb-console__row">
          <div>
            <span className="sb-eyebrow">⭐ {c('kicker', l)}</span>
            <h1>{c('title', l)}</h1>
            <p className="sb-body">{c('subtitle', l)}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="#submit-review" className="sb-button-primary" style={{ fontSize: 13, padding: '10px 18px' }}>{c('shareCta', l)}</a>
            {isAdmin && <a href="#admin-console" className="sb-button-secondary" style={{ fontSize: 13, padding: '10px 18px' }}>{c('adminCta', l)}</a>}
          </div>
        </div>
        <div className="sb-telemetry">
          <div><b className="gold">{enrichedReviews.length}</b><span>{c('total', l)}</span></div>
          <div><b className="warn">{pendingCount}</b><span>{c('pending', l)}</span></div>
          <div><b className="ok">{approvedCount}</b><span>{c('approved', l)}</span></div>
          <div><b style={{ color: flaggedCount ? '#fca5a5' : undefined }}>{flaggedCount}</b><span>{c('flagged', l)}</span></div>
          <div><b>{avgRating.toFixed(1)} ★</b><span>{c('avg', l)}</span></div>
        </div>
      </header>

      {reviewsError && <div className="sb-review-alert">{reviewsError}</div>}

      {/* Submit link */}
      <section id="submit-review" className="sb-review-grid">
        <article className="sb-review-panel sb-review-panel--wide">
          <div className="sb-review-panel-header">
            <div>
              <p className="sb-eyebrow">{c('sendLinkTitle', l)}</p>
              <h2>{c('submissionTitle', l)}</h2>
            </div>
            <span className="sb-review-pill">{uiText('generatedUi.u_0d51008f777589f5')}{getLocaleLabel(activeLocale)}</span>
          </div>
          <p className="sb-caption">{c('sendLinkDesc', l)}</p>
          {slug.kind === 'loading' && <div className="sb-review-empty">{c('loading', l)}</div>}
          {slug.kind === 'none' && (
            <div className="sb-review-link-builder">
              <p>{c('pickHandleDesc', l)}</p>
              <div>
                <span>{uiText('generatedUi.u_4da42d3253ab7a2e')}</span>
                <input value={slugDraft} onChange={e => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder={c('handlePlaceholder', l)} maxLength={30} onKeyDown={e => e.key === 'Enter' && saveSlug()} />
                <button onClick={saveSlug} disabled={slugSaving || !slugDraft.trim()}>{slugSaving ? c('saving', l) : c('claim', l)}</button>
              </div>
              {slugError && <small>{slugError}</small>}
            </div>
          )}
          {slug.kind === 'set' && (
            <div className="sb-review-link-copy">
              <code>{reviewLink}</code>
              <button onClick={() => copyToClipboard(reviewLink)}>{copied ? `✓ ${c('copied', l)}` : c('copyLink', l)}</button>
              <a href={reviewLink} target="_blank" rel="noopener noreferrer">{c('openNewTab', l)} ↗</a>
            </div>
          )}
          <div className="sb-review-submission-preview" style={{ background: 'transparent', border: 0, borderInlineStart: '2px solid rgba(26,240,255,.4)', borderRadius: 0, padding: '4px 0 4px 14px' }}>
            <span className="sb-chip" style={{ marginBottom: 8 }}>{c('sampleBadge', l)}</span>
            <div className="sb-stars" aria-label={uiText('generatedUi.u_d6ad47db4d63b1b0')}>★★★★★</div>
            <p>{c('previewText', l)}</p>
            <strong>{formatReviewDate('2026-05-29T10:30:00.000Z', activeLocale)} · {formatReviewCurrency(49, activeLocale)}</strong>
            <label>
              {c('mediaLabel', l)}
              <input type="file" accept="image/*" multiple aria-label={c('mediaLabel', l)} />
            </label>
          </div>
        </article>

        <aside className="sb-review-panel">
          <p className="sb-eyebrow">{c('conciergeTitle', l)}</p>
          <h2>{c('conciergeHeadline', l)}</h2>
          <p>{c('conciergeBody', l)}</p>
          <div className="sb-review-ai-card">{positiveCampaigns[0] ?? c('noCampaigns', l)}</div>
        </aside>
      </section>

      {/* Filters */}
      <section className="sb-review-controls" aria-label={uiText('generatedUi.u_f63c5fd9d87ec8f3')}>
        <div>
          <h2>{c('yourReviews', l)}</h2>
          <p>{reviewsLoading ? c('loading', l) : summaryLine}</p>
        </div>
        <div className="sb-review-control-row">
          <select value={sortMode} onChange={e => setSortMode(e.target.value as ReviewSortMode)}>
            <option value="relevance">{c('sortRelevance', l)}</option>
            <option value="date">{c('sortDate', l)}</option>
            <option value="rating">{c('sortRating', l)}</option>
          </select>
          <select value={languageFilter} onChange={e => setLanguageFilter(e.target.value as 'all' | ReviewLocale)}>
            <option value="all">{c('allLanguages', l)}</option>
            {REVIEW_LOCALES.map(locale => <option key={locale} value={locale}>{getFlagForLocale(locale)} {getLocaleLabel(locale)}</option>)}
          </select>
          <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}>
            <option value="all">{c('allPartners', l)}</option>
            {partners.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={productFilter} onChange={e => setProductFilter(e.target.value)}>
            <option value="all">{c('allProducts', l)}</option>
            {products.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="sb-review-tabs">
          {([
            { id: "all",      label: `${c('filterAll', l)} (${enrichedReviews.length})` },
            { id: "pending",  label: `${c('filterPending', l)} (${pendingCount})` },
            { id: "approved", label: `${c('filterApproved', l)} (${approvedCount})` },
            { id: "flagged",  label: `${c('filterFlagged', l)} (${flaggedCount})` },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setStatusFilter(tab.id)} className={statusFilter === tab.id ? 'is-active' : ''}>{tab.label}</button>
          ))}
        </div>
      </section>

      {/* Review feed */}
      <section className="sb-review-feed" aria-label={uiText('generatedUi.u_4fb20d256acefb38')}>
        {visibleReviews.length === 0 && !reviewsLoading && (
          <div className="sb-review-empty">{c('summaryEmpty', l)}</div>
        )}
        {visibleReviews.map(review => {
          const badge = getSentimentBadge(review.sentiment ?? 'neutral')
          const moderationSuggestion = buildModerationSuggestion(review)
          return (
            <article key={review.id} className="sb-review-card">
              <div className="sb-review-card-top">
                <div>
                  <h3>{getFlagForLocale(review.language)} {review.author_name}</h3>
                  <span>{getLocaleLabel(review.language)} · {formatReviewDate(review.created_at, review.language)} · {(review.product_name || review.service_name || c('generalService', l))}</span>
                </div>
                <div className="sb-stars" aria-label={`${review.rating} stars`}>{'★'.repeat(review.rating)}<span>{'★'.repeat(5 - review.rating)}</span></div>
              </div>
              <p>{review.content}</p>
              {translatedReviewId === review.id && <blockquote>{translationPreview[activeLocale]}</blockquote>}
              <div className="sb-review-card-meta">
                <span style={{ borderColor: badge.color, color: badge.color }}>{badge.label}</span>
                {review.verified_partner && <span className="verified">✓ {c('verifiedPartner', l)}</span>}
                {review.flagged && <span className="flagged">⚑ {c('flagged', l)}</span>}
                {(review.media_urls?.length ?? 0) > 0 && <span>🖼 {review.media_urls?.length} {c('media', l)}</span>}
              </div>
              <div className="sb-review-actions">
                <button onClick={() => patchReview(review.id, { approved: !review.approved, moderation_status: !review.approved ? 'approved' : 'pending' })}>{review.approved ? c('unpublish', l) : c('approve', l)}</button>
                <button onClick={() => patchReview(review.id, { flagged: !review.flagged, moderation_status: !review.flagged ? 'flagged' : 'pending' })}>{review.flagged ? c('unflag', l) : c('flag', l)}</button>
                <button onClick={() => setTranslatedReviewId(translatedReviewId === review.id ? null : review.id)}>{c('translate', l)}</button>
                <button onClick={() => deleteReview(review.id)}>{c('delete', l)}</button>
              </div>
              <small>{moderationSuggestion}</small>
            </article>
          )
        })}
      </section>

      {/* Admin console — owner/admin only */}
      {isAdmin && (
        <section id="admin-console" className="sb-admin-review-console" aria-label={uiText('generatedUi.u_89ea5bcb5575ffbc')}>
          <div className="sb-review-panel-header">
            <div>
              <p className="sb-eyebrow">{c('adminConsole', l)}</p>
              <h2>{c('telemetryTitle', l)}</h2>
            </div>
            <span className="sb-review-pill">{c('logsEnabled', l)}</span>
          </div>
          <div className="sb-admin-review-grid">
            <article className="sb-review-panel">
              <h3>{c('localeVolume', l)}</h3>
              {localeTelemetry.map(item => (
                <div key={item.locale} className="sb-bar">
                  <span>{getFlagForLocale(item.locale)} {item.locale.toUpperCase()}</span>
                  <i style={{ width: `${Math.max(8, item.percentage)}%`, background: CYAN }} />
                  <strong>{item.count}</strong>
                </div>
              ))}
            </article>
            <article className="sb-review-panel">
              <h3>{c('sentimentTrend', l)}</h3>
              {sentimentTrend.map(item => (
                <div key={item.sentiment} className="sb-bar">
                  <span>{item.sentiment}</span>
                  <i style={{ width: `${Math.max(8, item.percentage)}%`, background: item.sentiment === 'positive' ? GREEN : item.sentiment === 'negative' ? RED : GOLD }} />
                  <strong>{item.count}</strong>
                </div>
              ))}
            </article>
            <article className="sb-review-panel">
              <h3>{c('moderationQueue', l)}</h3>
              {enrichedReviews.filter(r => !r.approved || r.flagged).slice(0, 5).map(review => (
                <p key={review.id}><strong>{review.author_name}</strong> · {review.moderation_status} · {buildModerationSuggestion(review)}</p>
              ))}
            </article>
            <article className="sb-review-panel">
              <h3>{c('outreachHooks', l)}</h3>
              {positiveCampaigns.map(campaign => <p key={campaign}>• {campaign}</p>)}
              <p>• {c('crmRegression', l)}</p>
            </article>
          </div>
        </section>
      )}
    </div>
  )
}
