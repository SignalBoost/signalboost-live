'use client'

import Link from 'next/link'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'
import { PUBLIC_BRAND } from '@/lib/public-brand'
import { SELF_HEALING_MONITOR_LINK } from '@/lib/outreach/adLandingPages'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY = {
  eyebrow:   { en: uiText('generatedUi.u_c205924de0fe636c'), es: 'Documentación', pt: 'Documentação', pl: 'Dokumentacja', ru: 'Документация', de: 'Dokumentation', fr: 'Documentation', it: 'Documentazione', ja: 'ドキュメント', ko: '문서', ar: 'الوثائق' },
  title:     { en: uiText('generatedUi.u_0780e63f1bf7055e'), es: 'Un mapa claro para construir con SignalBoost.', pt: 'Um mapa claro para construir com SignalBoost.', pl: 'Przejrzysta mapa do budowania z SignalBoost.', ru: 'Чёткая карта для создания с SignalBoost.', de: 'Eine klare Übersicht für die Entwicklung mit SignalBoost.', fr: 'Une feuille de route claire pour construire avec SignalBoost.', it: 'Una mappa chiara per costruire con SignalBoost.', ja: 'SignalBoost で構築するためのわかりやすいマップ。', ko: 'SignalBoost로 구축하기 위한 명확한 지도.', ar: 'خريطة واضحة للبناء باستخدام SignalBoost.' },
  subtitle:  { en: uiText('generatedUi.u_e24329b6d3d67d3b'), es: 'Los docs están organizados por cómo una persona piensa el trabajo: elige una intención, sigue la guía IA, revisa el resultado y aprueba la acción final.', pt: 'Os docs estão organizados por como uma pessoa pensa o trabalho: escolha uma intenção, siga a orientação IA, revise o resultado e aprove a ação final.', pl: 'Dokumenty są zorganizowane według sposobu myślenia człowieka: wybierz intencję, śledź wskazówki AI, sprawdź wynik i zatwierdź końcowe działanie.', ru: 'Документы организованы так, как человек думает о работе: выберите намерение, следуйте руководству ИИ, проверьте результат и одобрите финальное действие.', de: 'Die Dokumentation ist so aufgebaut, wie ein Mensch Arbeit durchdenkt: Absicht wählen, der KI-Anleitung folgen, das Ergebnis prüfen und die finale Aktion genehmigen.', fr: 'La documentation est organisée selon la façon dont un humain aborde le travail : choisir une intention, suivre les conseils de l’IA, examiner le résultat et approuver l’action finale.', it: 'La documentazione è organizzata secondo il modo in cui una persona affronta il lavoro: scegli un intento, segui la guida dell’AI, rivedi il risultato e approva l’azione finale.', ja: 'ドキュメントは、人が作業を考える流れに沿って構成されています。意図を選び、AIのガイダンスに従い、出力を確認し、最終アクションを承認します。', ko: '문서는 사람이 작업을 생각하는 방식에 따라 구성되어 있습니다. 의도를 선택하고, AI 안내를 따르고, 결과를 검토한 뒤 최종 작업을 승인하세요.', ar: 'نُظّمت المستندات وفق طريقة تفكير الإنسان في العمل: اختر هدفًا، واتبع إرشادات الذكاء الاصطناعي، وراجع النتيجة، ثم وافق على الإجراء النهائي.' },
  scanPath:  { en: uiText('generatedUi.u_afa0e4fd44228456'), es: 'Ruta de escaneo', pt: 'Caminho de leitura', pl: 'Ścieżka skanowania', ru: 'Путь обзора', de: 'Scanpfad', fr: 'Chemin d\'analyse', it: 'Percorso di scansione', ja: 'スキャンパス', ko: '스캔 경로', ar: 'مسار الفحص' },
  step:      { en: uiText('generatedUi.u_8e6a6cca7aae1d1e'), es: 'Paso', pt: 'Passo', pl: 'Krok', ru: 'Шаг', de: 'Schritt', fr: 'Étape', it: 'Passaggio', ja: 'ステップ', ko: '단계', ar: 'الخطوة' },
  publicTools: {
    title: { en: uiText('generatedUi.u_1d2636194869cd3e'), es: 'Herramientas públicas gratis / páginas para anuncios', pt: 'Ferramentas públicas gratuitas / páginas para anúncios', pl: 'Darmowe narzędzia publiczne / strony do reklam', ru: 'Бесплатные публичные инструменты / страницы для рекламы', de: 'Kostenlose öffentliche Tools / Anzeigen-Landingpages', fr: 'Outils publics gratuits / pages de destination publicitaires', it: 'Strumenti pubblici gratuiti / landing page pubblicitarie', ja: '無料の公開ツール／広告ランディングページ', ko: '무료 공개 도구 / 광고 랜딩 페이지', ar: 'أدوات عامة مجانية / صفحات هبوط إعلانية' },
    body: { en: uiText('generatedUi.u_ffbe5fdd1274dcf7'), es: 'Usa estos enlaces al preparar anuncios para periódicos digitales, clasificados comunitarios o directorios locales. Los dos primeros son públicos y mejores para anuncios fríos.', pt: 'Use estes links ao preparar anúncios para jornais digitais, classificados comunitários ou diretórios locais. Os dois primeiros são públicos e melhores para anúncios frios.', pl: 'Używaj tych linków przy przygotowywaniu reklam do gazet cyfrowych, ogłoszeń społecznościowych lub katalogów lokalnych. Pierwsze dwa są publiczne i najlepsze do reklam.', ru: 'Используйте эти ссылки для цифровых газет, объявлений и локальных каталогов. Первые две страницы публичные и лучше подходят для рекламы.', de: 'Verwenden Sie diese Links bei der Vorbereitung von Anzeigen in digitalen Zeitungen, Community-Kleinanzeigen oder lokalen Verzeichnissen. Die ersten beiden sind öffentlich unbedenklich und eignen sich am besten für Kaltakquise-Anzeigen.', fr: 'Utilisez ces liens pour préparer des annonces dans des journaux numériques, des petites annonces communautaires ou des annuaires locaux. Les deux premiers sont adaptés au public et conviennent le mieux aux annonces publiques de prospection à froid.', it: 'Usa questi link quando prepari annunci su giornali digitali, piccoli annunci della comunità o directory locali. I primi due sono sicuri per il pubblico e ideali per annunci pubblici a freddo.', ja: 'デジタル新聞、地域の求人・広告欄、ローカルディレクトリ向けの広告を準備する際にこれらのリンクを使用してください。最初の2つは一般公開しても安全で、コールド向けの公開広告に最適です。', ko: '디지털 신문, 커뮤니티 안내 광고 또는 지역 디렉터리 광고를 준비할 때 이 링크를 사용하세요. 처음 두 개는 공개해도 안전하며 콜드 공개 광고에 가장 적합합니다.', ar: 'استخدم هذه الروابط عند إعداد إعلانات الصحف الرقمية أو الإعلانات المبوبة المجتمعية أو أدلة الأعمال المحلية. الرابطان الأولان آمنان للنشر العام وهما الأنسب للإعلانات العامة الموجهة لجمهور جديد.' },
    bestForAds: { en: uiText('generatedUi.u_62a9d03cb2e245c8'), es: 'Mejor para anuncios', pt: 'Melhor para anúncios', pl: 'Najlepsze do reklam', ru: 'Лучше для рекламы', de: 'Ideal für Zeitungsanzeigen', fr: 'Idéal pour les annonces dans la presse', it: 'Ideale per annunci sui giornali', ja: '新聞広告に最適', ko: '신문 광고에 최적', ar: 'الأفضل لإعلانات الصحف' },
    internal: { en: uiText('generatedUi.u_4807513a2c62c69c'), es: 'Referencia interna / con sesión', pt: 'Referência interna / com login', pl: 'Wewnętrzne / po zalogowaniu', ru: 'Внутренняя ссылка / вход', de: 'Interne Referenz / angemeldet', fr: 'Référence interne / connecté', it: 'Riferimento interno / con accesso', ja: '内部 / ログイン済みの参照', ko: '내부 / 로그인 상태 참조', ar: 'مرجع داخلي / بعد تسجيل الدخول' },
  },
  quickLinks: {
    dashboard: { en: uiText('generatedUi.u_67b696468610b879'), es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель', de: 'Dashboard', fr: 'Tableau de bord', it: 'Dashboard', ja: 'ダッシュボード', ko: '대시보드', ar: 'لوحة المعلومات' },
    outreach:  { en: uiText('generatedUi.u_7b855b0f8767d64d'), es: 'Motor de prospección', pt: 'Motor de prospecção', pl: 'Silnik outreach', ru: 'Движок аутрича', de: 'Outreach-Engine', fr: 'Moteur de prospection', it: 'Motore di outreach', ja: 'アウトリーチエンジン', ko: '아웃리치 엔진', ar: 'محرك التواصل' },
    pricing:   { en: uiText('generatedUi.u_dfe95783edfef791'), es: 'Precios', pt: 'Preços', pl: 'Cennik', ru: 'Цены', de: 'Preise', fr: 'Tarifs', it: 'Prezzi', ja: '料金', ko: '요금', ar: 'الأسعار' },
    support:   { en: uiText('generatedUi.u_be91940b79f46910'), es: 'Soporte', pt: 'Suporte', pl: 'Wsparcie', ru: 'Поддержка', de: 'Support', fr: 'Assistance', it: 'Supporto', ja: 'サポート', ko: '지원', ar: 'الدعم' },
  },
  sections: [
    {
      step: '1',
      title: { en: uiText('generatedUi.u_430539f52f4f1660'), es: 'Elige una intención', pt: 'Escolha uma intenção', pl: 'Wybierz intencję', ru: 'Выберите намерение', de: 'Absicht wählen', fr: 'Choisissez une intention', it: 'Scegli un intento', ja: '目的を選択', ko: '의도 선택', ar: 'اختر نية' },
      body:  { en: uiText('generatedUi.u_154f68c6ba5be876'), es: 'Comienza con Promocionar, Constructor, Reseñas, Audio, Video o Prospección para que cada flujo tenga un objetivo claro.', pt: 'Comece com Promover, Construtor, Avaliações, Áudio, Vídeo ou Prospecção para que cada fluxo tenha um objetivo claro.', pl: 'Zacznij od Promocji, Kreatora, Opinii, Audio, Wideo lub Outreachu, aby każdy przepływ miał jeden jasny cel.', ru: 'Начните с Продвижения, Конструктора, Отзывов, Аудио, Видео или Аутрича, чтобы каждый процесс имел одну чёткую цель.', de: 'Beginnen Sie mit Bewerben, Builder, Bewertungen, Audio, Video oder Outreach, damit jeder Workflow ein klares Ziel hat.', fr: 'Commencez par Promouvoir, Créateur, Avis, Audio, Vidéo ou Prospection afin que chaque workflow ait un objectif clair.', it: 'Inizia con Promuovi, Builder, Recensioni, Audio, Video o Outreach, così ogni flusso di lavoro ha un unico obiettivo chiaro.', ja: 'プロモート、ビルダー、レビュー、オーディオ、動画、アウトリーチのいずれかから始めると、各ワークフローの目標が明確になります。', ko: '홍보, 빌더, 리뷰, 오디오, 동영상 또는 아웃리치로 시작하여 모든 워크플로에 하나의 명확한 목표를 두세요.', ar: 'ابدأ بـ الترويج أو المُنشئ أو المراجعات أو الصوت أو الفيديو أو التواصل ليكون لكل مسار عمل هدف واضح واحد.' },
    },
    {
      step: '2',
      title: { en: uiText('generatedUi.u_e4bf4dffb3e56b97'), es: 'Deja que la IA sugiera primero', pt: 'Deixe a IA sugerir primeiro', pl: 'Najpierw pozwól AI zasugerować', ru: 'Сначала пусть ИИ предложит', de: 'Zuerst KI vorschlagen lassen', fr: 'Laisser l’IA suggérer d’abord', it: 'Lascia che sia l’AI a suggerire prima', ja: 'まずAIに提案させる', ko: 'AI가 먼저 제안하도록 하기', ar: 'دع الذكاء الاصطناعي يقترح أولًا' },
      body:  { en: uiText('generatedUi.u_3cac59a88b978d17'), es: 'Lee el prompt sugerido, el tono y el feedback antes de escribir tus propias instrucciones.', pt: 'Leia o prompt sugerido, o tom e o feedback antes de digitar suas próprias instruções.', pl: 'Przeczytaj sugerowany prompt, ton i informacje zwrotne przed wpisaniem własnych instrukcji.', ru: 'Прочитайте предложенный промпт, тон и обратную связь перед вводом собственных инструкций.', de: 'Lesen Sie den vorgeschlagenen Prompt, den Ton und das Feedback, bevor Sie eigene Anweisungen eingeben.', fr: 'Lisez le prompt, le ton et les retours suggérés avant de saisir vos propres instructions.', it: 'Leggi il prompt, il tono e il feedback suggeriti prima di scrivere le tue istruzioni.', ja: '独自の指示を入力する前に、提案されたプロンプト、トーン、フィードバックをお読みください。', ko: '직접 지시를 입력하기 전에 제안된 프롬프트, 어조 및 피드백을 읽어 보세요.', ar: 'اقرأ الموجّه والنبرة والملاحظات المقترحة قبل كتابة تعليماتك الخاصة.' },
    },
    {
      step: '3',
      title: { en: uiText('generatedUi.u_cbc6271c8f8a3814'), es: 'Revisa los activos generados', pt: 'Revise os ativos gerados', pl: 'Przejrzyj wygenerowane zasoby', ru: 'Проверьте созданные материалы', de: 'Generierte Assets prüfen', fr: 'Vérifier les ressources générées', it: 'Rivedi gli asset generati', ja: '生成されたアセットを確認', ko: '생성된 에셋 검토', ar: 'مراجعة الأصول المُنشأة' },
      body:  { en: uiText('generatedUi.u_d3265c3960ec34b1'), es: 'Escanea tarjetas agrupadas: resumen, audiencia, copy, prueba y riesgos. Evita saltar entre paneles no relacionados.', pt: 'Escaneie cartões agrupados: resumo, público, copy, prova e riscos. Evite pular entre painéis não relacionados.', pl: 'Skanuj zgrupowane karty: podsumowanie, odbiorcy, treść, dowód i ryzyka. Unikaj przeskakiwania między niezwiązanymi panelami.', ru: 'Просматривайте сгруппированные карточки: резюме, аудитория, текст, доказательства и риски. Избегайте прыжков между несвязанными панелями.', de: 'Gruppierte Karten überfliegen: Zusammenfassung, Zielgruppe, Text, Nachweis und Risiken. Vermeiden Sie das Hin- und Herspringen zwischen unzusammenhängenden Bereichen.', fr: 'Parcourez les cartes regroupées : résumé, audience, texte, preuves et risques. Évitez de passer d’un panneau sans rapport à l’autre.', it: 'Scorri le schede raggruppate: riepilogo, pubblico, testo, prove e rischi. Evita di saltare tra pannelli non correlati.', ja: 'グループ化されたカード（概要、オーディエンス、コピー、根拠、リスク）に目を通してください。関係のないパネル間を行き来しないようにしてください。', ko: '그룹화된 카드(요약, 대상, 문구, 증거, 위험)를 훑어보세요. 관련 없는 패널 사이를 오가지 마세요.', ar: 'تصفّح البطاقات المجمّعة: الملخص والجمهور والنص والإثبات والمخاطر. تجنّب التنقل بين لوحات غير مترابطة.' },
    },
    {
      step: '4',
      title: { en: uiText('generatedUi.u_12e2352c79f6a630'), es: 'Aprueba y publica', pt: 'Aprove e publique', pl: 'Zatwierdź i opublikuj', ru: 'Одобрите и опубликуйте', de: 'Freigeben und veröffentlichen', fr: 'Approuver et publier', it: 'Approva e pubblica', ja: '承認して公開', ko: '승인 및 게시', ar: 'اعتماد ونشر' },
      body:  { en: uiText('generatedUi.u_630295474c2bc325'), es: 'Usa la cola de aprobación para el juicio humano final antes de que el outreach o el contenido público se publique.', pt: 'Use a fila de aprovação para o julgamento humano final antes que o outreach ou conteúdo público seja publicado.', pl: 'Użyj kolejki zatwierdzania do ostatecznej oceny ludzkiej przed uruchomieniem outreachu lub treści publicznych.', ru: 'Используйте очередь одобрения для финального человеческого решения перед публикацией аутрича или публичного контента.', de: 'Nutzen Sie die Genehmigungswarteschlange für die abschließende menschliche Beurteilung, bevor Outreach oder öffentliche Inhalte live gehen.', fr: 'Utilisez la file d’approbation pour le jugement humain final avant la mise en ligne de la prospection ou du contenu public.', it: 'Usa la coda di approvazione per il giudizio umano finale prima che l’outreach o i contenuti pubblici vengano pubblicati.', ja: 'アウトリーチや公開コンテンツを公開する前に、承認キューで最終的な人による判断を行ってください。', ko: '아웃리치나 공개 콘텐츠가 게시되기 전에 승인 대기열에서 최종적으로 사람이 판단하세요.', ar: 'استخدم قائمة انتظار الموافقات لإصدار الحكم البشري النهائي قبل نشر التواصل أو المحتوى العام.' },
    },
  ],
}

const AD_LANDING_LINKS = [
  {
    title: uiText('generatedUi.u_9b08bb7787a20df3'),
    href: '/website-optimizer',
    url: `${PUBLIC_BRAND.siteUrl}/website-optimizer`,
    badge: uiText('generatedUi.u_62a9d03cb2e245c8'),
    description: uiText('generatedUi.u_b20c20c5ab9377af'),
  },
  {
    title: uiText('generatedUi.u_d87843ad1d95baec'),
    href: '/cybersecurity-check',
    url: `${PUBLIC_BRAND.siteUrl}/cybersecurity-check`,
    badge: uiText('generatedUi.u_62a9d03cb2e245c8'),
    description: uiText('generatedUi.u_3f2358c4b00716ce'),
  },
  {
    title: uiText('generatedUi.u_281ad82f2d803589'),
    href: '/dashboard/audit',
    url: `${PUBLIC_BRAND.siteUrl}/dashboard/audit`,
    badge: uiText('generatedUi.u_4807513a2c62c69c'),
    description: uiText('generatedUi.u_205886a4abbf9551'),
  },
  {
    ...SELF_HEALING_MONITOR_LINK,
  },
]

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

export default function DocsPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang

  const quickLinks = [
    { label: c(COPY.quickLinks.dashboard, l), href: '/dashboard' },
    { label: c(COPY.quickLinks.outreach, l),  href: '/dashboard/outreach/outreach' },
    { label: c(COPY.quickLinks.pricing, l),   href: '/pricing' },
    { label: c(COPY.quickLinks.support, l),   href: '/support' },
  ]

  return (
    <div className="sb-page-shell" style={{ padding: 'clamp(18px,4vw,48px) 0 80px', color: 'var(--text-primary)', display: 'grid', gap: 22 }}>

      {/* Header — flat compact bar */}
      <section style={{ borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>📖 {c(COPY.eyebrow, l)}</p>
            <h1 style={{ fontSize: 24, fontWeight: 950, letterSpacing: '-.045em', lineHeight: 1.1, margin: '4px 0 0' }}>{c(COPY.title, l)}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {quickLinks.map(({ label, href }) => (
              <Link key={href} className="sb-button-secondary" href={href} style={{ fontSize: 12, padding: '7px 13px' }}>{label}</Link>
            ))}
          </div>
        </div>
      </section>

      {/* Body */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, alignItems: 'start' }} className="sb-docs-grid">

        {/* Sidebar nav */}
        <aside style={{ borderRight: '1px solid rgba(255,255,255,.08)', paddingRight: 20, position: 'sticky', top: 90 }}>
          <p className="sb-eyebrow" style={{ marginBottom: 14 }}>{c(COPY.scanPath, l)}</p>
          <nav style={{ display: 'grid', gap: 10 }}>
            <a href="#ad-landing-pages" style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#1af0ff', fontWeight: 900, fontSize: 11, marginTop: 2, flexShrink: 0 }}>{uiText('generatedUi.u_0d1c315edb9b395c')}</span>
              {c(COPY.publicTools.title, l)}
            </a>
            {COPY.sections.map(s => (
              <a key={s.step} href={`#step-${s.step}`} style={{ color: 'rgba(255,255,255,.7)', textDecoration: 'none', fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#ffc300', fontWeight: 900, fontSize: 11, marginTop: 2, flexShrink: 0 }}>{c(COPY.step, l)} {s.step}</span>
                {c(s.title, l)}
              </a>
            ))}
          </nav>
        </aside>

        {/* Steps */}
        <div style={{ display: 'grid', gap: 14 }}>
          <article id="ad-landing-pages" style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '18px 0 8px', scrollMarginTop: 90 }}>
            <p className="sb-eyebrow" style={{ marginBottom: 8 }}>{uiText('generatedUi.u_05142b6381c80017')}</p>
            <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 10px' }}>{c(COPY.publicTools.title, l)}</h2>
            <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.7, fontSize: 14, margin: 0 }}>{c(COPY.publicTools.body, l)}</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {AD_LANDING_LINKS.map(link => (
                <Link key={link.href} href={link.href} style={{ display: 'grid', gap: 6, border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: 14, color: 'inherit', textDecoration: 'none', background: 'rgba(255,255,255,.035)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong style={{ color: '#fff', fontSize: 14 }}>{link.title}</strong>
                    <span style={{ border: '1px solid rgba(26,240,255,.28)', borderRadius: 999, color: '#1af0ff', padding: '3px 8px', fontSize: 11, fontWeight: 900 }}>{link.badge}</span>
                  </div>
                  <code style={{ color: '#ffc300', fontSize: 12, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{link.url}</code>
                  <span style={{ color: 'rgba(255,255,255,.58)', fontSize: 13, lineHeight: 1.5 }}>{link.description}</span>
                </Link>
              ))}
            </div>
          </article>

          {COPY.sections.map(s => (
            <article key={s.step} id={`step-${s.step}`} style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '18px 0 6px', scrollMarginTop: 90 }}>
              <p className="sb-eyebrow" style={{ marginBottom: 8 }}>{c(COPY.step, l)} {s.step}</p>
              <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 10px' }}>{c(s.title, l)}</h2>
              <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.7, fontSize: 14, margin: 0 }}>{c(s.body, l)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
