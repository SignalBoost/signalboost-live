// saas/lib/i18n/unifiedPricingCopy.ts
// SINGLE localization bundle for the unified pricing storefront. One accessor —
// getUnifiedPricingCopy(lang) — returns shared chrome + all three lanes' copy in
// the active locale, so views contain ZERO hardcoded strings and no manual
// fallbacks. The audit lane's rich, already-shipped, locale-tested feature matrix
// is composed from auditPricingCopy (the proven source) rather than re-typed here.

import { getAuditPricingCopy, AuditLocale } from '@/lib/i18n/auditPricingCopy'
import { ProductLine } from '@/lib/config/unifiedPricing'

export type PricingLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
const LOCALES: PricingLocale[] = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']

export interface TierCopy {
  description: string
  features: string[]
  highlight?: string   // optional emphasised line (audit credits pill)
  topup?: string       // optional secondary line (audit top-ups)
}
export interface LaneCopy { tiers: Record<string, TierCopy> }

export interface SharedCopy {
  kicker: string
  pageTitle: string
  pageSubtitle: string
  perMonth: string
  popular: string
  cta: string
  contactSales: string
  loading: string
  error: string
  notConfigured: string
  disclaimer: string
  tabs: Record<ProductLine, string>
}

export interface UnifiedPricingCopy {
  shared: SharedCopy
  lanes: Record<ProductLine, LaneCopy>
}

// ─── Shared chrome (per locale) ──────────────────────────────────────────────
const SHARED: Record<PricingLocale, SharedCopy> = {
  en: {
    kicker: 'Pricing', pageTitle: 'Plans & Pricing',
    pageSubtitle: 'Choose the product and plan that fit your team.',
    perMonth: '/ mo', popular: 'Most Popular', cta: 'Upgrade Now', contactSales: 'Contact sales',
    loading: 'Processing…', error: 'Something went wrong. Please try again.',
    notConfigured: 'Upgrade is processed through Stripe. Pricing is not configured yet — check back soon.',
    disclaimer: 'SignalBoost provides automated compliance readiness mapping and cybersecurity posture analysis. It does not issue official compliance certifications.',
    tabs: { audit: 'Audit & Cybersecurity', platform: 'Core Platform', podcast: 'Podcast Suite' },
  },
  es: {
    kicker: 'Precios', pageTitle: 'Planes y precios',
    pageSubtitle: 'Elige el producto y el plan que se adapten a tu equipo.',
    perMonth: '/ mes', popular: 'Más Popular', cta: 'Actualizar Ahora', contactSales: 'Contactar con ventas',
    loading: 'Procesando…', error: 'Algo salió mal. Inténtalo de nuevo.',
    notConfigured: 'La actualización se procesa con Stripe. Los precios aún no están configurados — vuelve pronto.',
    disclaimer: 'SignalBoost ofrece mapeo automatizado de preparación para el cumplimiento y análisis de la postura de ciberseguridad. No emite certificaciones de cumplimiento oficiales.',
    tabs: { audit: 'Auditoría y ciberseguridad', platform: 'Plataforma principal', podcast: 'Suite de podcasts' },
  },
  pt: {
    kicker: 'Preços', pageTitle: 'Planos e preços',
    pageSubtitle: 'Escolha o produto e o plano que se encaixam na sua equipe.',
    perMonth: '/ mês', popular: 'Mais Popular', cta: 'Atualizar Agora', contactSales: 'Falar com vendas',
    loading: 'Processando…', error: 'Algo deu errado. Tente novamente.',
    notConfigured: 'A atualização é processada pelo Stripe. Os preços ainda não estão configurados — volte em breve.',
    disclaimer: 'A SignalBoost fornece mapeamento automatizado de prontidão para conformidade e análise da postura de cibersegurança. Não emite certificações de conformidade oficiais.',
    tabs: { audit: 'Auditoria e cibersegurança', platform: 'Plataforma principal', podcast: 'Suíte de podcasts' },
  },
  pl: {
    kicker: 'Cennik', pageTitle: 'Plany i ceny',
    pageSubtitle: 'Wybierz produkt i plan dopasowany do Twojego zespołu.',
    perMonth: '/ mies.', popular: 'Najpopularniejszy', cta: 'Ulepsz teraz', contactSales: 'Skontaktuj się z działem sprzedaży',
    loading: 'Przetwarzanie…', error: 'Coś poszło nie tak. Spróbuj ponownie.',
    notConfigured: 'Ulepszenie jest przetwarzane przez Stripe. Ceny nie są jeszcze skonfigurowane — sprawdź wkrótce.',
    disclaimer: 'SignalBoost zapewnia zautomatyzowane mapowanie gotowości do zgodności oraz analizę stanu cyberbezpieczeństwa. Nie wydaje oficjalnych certyfikatów zgodności.',
    tabs: { audit: 'Audyt i cyberbezpieczeństwo', platform: 'Platforma podstawowa', podcast: 'Pakiet podcastów' },
  },
  ru: {
    kicker: 'Цены', pageTitle: 'Планы и цены',
    pageSubtitle: 'Выберите продукт и план для вашей команды.',
    perMonth: '/ мес.', popular: 'Самый популярный', cta: 'Обновить сейчас', contactSales: 'Связаться с отделом продаж',
    loading: 'Обработка…', error: 'Что-то пошло не так. Попробуйте снова.',
    notConfigured: 'Обновление обрабатывается через Stripe. Цены ещё не настроены — загляните позже.',
    disclaimer: 'SignalBoost предоставляет автоматизированное картирование готовности к соответствию и анализ состояния кибербезопасности. Он не выдаёт официальные сертификаты соответствия.',
    tabs: { audit: 'Аудит и кибербезопасность', platform: 'Основная платформа', podcast: 'Пакет подкастов' },
  },
  de: {
    kicker: 'Preise', pageTitle: 'Pläne & Preise',
    pageSubtitle: 'Wählen Sie das Produkt und den Plan, die zu Ihrem Team passen.',
    perMonth: '/ Monat', popular: 'Am beliebtesten', cta: 'Jetzt upgraden', contactSales: 'Vertrieb kontaktieren',
    loading: 'Wird verarbeitet…', error: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
    notConfigured: 'Das Upgrade wird über Stripe abgewickelt. Die Preise sind noch nicht konfiguriert – schauen Sie bald wieder vorbei.',
    disclaimer: 'SignalBoost bietet automatisierte Zuordnung der Compliance-Bereitschaft und Analyse der Cybersicherheitslage. Es stellt keine offiziellen Compliance-Zertifizierungen aus.',
    tabs: { audit: 'Audit & Cybersicherheit', platform: 'Kernplattform', podcast: 'Podcast-Suite' },
  },
  fr: {
    kicker: 'Tarifs', pageTitle: 'Forfaits et tarifs',
    pageSubtitle: 'Choisissez le produit et le forfait adaptés à votre équipe.',
    perMonth: '/ mois', popular: 'Le plus populaire', cta: 'Passer à l\'offre supérieure', contactSales: 'Contacter les ventes',
    loading: 'Traitement…', error: 'Une erreur s’est produite. Veuillez réessayer.',
    notConfigured: 'La mise à niveau est traitée via Stripe. Les tarifs ne sont pas encore configurés — revenez bientôt.',
    disclaimer: 'SignalBoost fournit une cartographie automatisée de la préparation à la conformité et une analyse de la posture de cybersécurité. Il ne délivre pas de certifications de conformité officielles.',
    tabs: { audit: 'Audit et cybersécurité', platform: 'Plateforme principale', podcast: 'Suite podcast' },
  },
  it: {
    kicker: 'Prezzi', pageTitle: 'Piani e prezzi',
    pageSubtitle: 'Scegli il prodotto e il piano più adatti al tuo team.',
    perMonth: '/ mese', popular: 'Più popolare', cta: 'Esegui l\'upgrade', contactSales: 'Contatta le vendite',
    loading: 'Elaborazione…', error: 'Si è verificato un errore. Riprova.',
    notConfigured: 'L\'upgrade viene elaborato tramite Stripe. I prezzi non sono ancora configurati: torna presto.',
    disclaimer: 'SignalBoost offre una mappatura automatizzata della prontezza alla conformità e un\'analisi della postura di cybersicurezza. Non rilascia certificazioni di conformità ufficiali.',
    tabs: { audit: 'Audit e cybersicurezza', platform: 'Piattaforma principale', podcast: 'Suite podcast' },
  },
  ja: {
    kicker: '料金', pageTitle: 'プランと料金',
    pageSubtitle: 'チームに合った製品とプランをお選びください。',
    perMonth: '/ 月', popular: '一番人気', cta: '今すぐアップグレード', contactSales: '営業に問い合わせる',
    loading: '処理中…', error: '問題が発生しました。もう一度お試しください。',
    notConfigured: 'アップグレードは Stripe で処理されます。料金はまだ設定されていません。しばらくしてから再度ご確認ください。',
    disclaimer: 'SignalBoost は、コンプライアンス準備状況の自動マッピングとサイバーセキュリティ態勢の分析を提供します。公式のコンプライアンス認証は発行しません。',
    tabs: { audit: '監査とサイバーセキュリティ', platform: 'コアプラットフォーム', podcast: 'ポッドキャストスイート' },
  },
  ko: {
    kicker: '요금', pageTitle: '요금제 및 가격',
    pageSubtitle: '팀에 맞는 제품과 요금제를 선택하세요.',
    perMonth: '/ 월', popular: '가장 인기', cta: '지금 업그레이드', contactSales: '영업팀 문의',
    loading: '처리 중…', error: '문제가 발생했습니다. 다시 시도하세요.',
    notConfigured: '업그레이드는 Stripe를 통해 처리됩니다. 아직 요금이 설정되지 않았습니다. 곧 다시 확인하세요.',
    disclaimer: 'SignalBoost는 자동화된 규정 준수 준비 상태 매핑과 사이버 보안 태세 분석을 제공합니다. 공식 규정 준수 인증서는 발급하지 않습니다.',
    tabs: { audit: '감사 및 사이버 보안', platform: '핵심 플랫폼', podcast: '팟캐스트 스위트' },
  },
  ar: {
    kicker: 'الأسعار', pageTitle: 'الخطط والأسعار',
    pageSubtitle: 'اختر المنتج والخطة المناسبين لفريقك.',
    perMonth: '/ شهريًا', popular: 'الأكثر شيوعًا', cta: 'الترقية الآن', contactSales: 'تواصل مع المبيعات',
    loading: 'جارٍ المعالجة…', error: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
    notConfigured: 'تتم معالجة الترقية عبر Stripe. لم يتم إعداد الأسعار بعد، يُرجى العودة قريبًا.',
    disclaimer: 'يوفّر SignalBoost رسم خرائط آليًا لجاهزية الامتثال وتحليلًا لوضع الأمن السيبراني، ولا يُصدر شهادات امتثال رسمية.',
    tabs: { audit: 'التدقيق والأمن السيبراني', platform: 'المنصة الأساسية', podcast: 'حزمة البودكاست' },
  },
}

// ─── Core Platform / website lane (real copy from the marketing page, translated) ─
const WEBSITE: Record<PricingLocale, LaneCopy> = {
  en: { tiers: {
    launch:  { description: 'For solo operators and small businesses', features: ['AI coding workspace: create, edit, run, test, debug, and repair code', '5-language platform: EN, PT, ES, PL, RU', '1 published website plus optimization tools', 'Canvas Video Studio with AI captions and MP4 export', 'Podcast launch and optimization workspace', 'Reviews, calendar, basic outreach, and assistant'] },
    growth:  { description: 'For growing businesses and small teams', features: ['Everything in Launch', 'Up to 5 websites/projects, deeper optimization', 'Video Studio templates, brand styling, higher usage', 'CoWork workspace, spreadsheets, reviews & outreach suite', 'Content planning, campaigns, and assistant workflows'] },
    command: { description: 'For agencies, teams, and serious operators', features: ['Everything in Growth', 'Expanded/unlimited websites and advanced workflows', 'Advanced video, larger usage pool, priority rendering', 'Team workspace, brand kit, white label, sales pipeline', 'Connectors, API path, dedicated onboarding & priority support'] },
  } },
  es: { tiers: {
    launch:  { description: 'Para operadores individuales y pequeñas empresas', features: ['Espacio de programación con IA: crea, edita, ejecuta, prueba, depura y repara código', 'Plataforma en 5 idiomas: EN, PT, ES, PL, RU', '1 sitio web publicado más herramientas de optimización', 'Canvas Video Studio con subtítulos por IA y exportación MP4', 'Espacio de lanzamiento y optimización de podcasts', 'Reseñas, calendario, prospección básica y asistente'] },
    growth:  { description: 'Para empresas en crecimiento y equipos pequeños', features: ['Todo lo de Launch', 'Hasta 5 sitios/proyectos, optimización más profunda', 'Plantillas de Video Studio, estilo de marca, mayor uso', 'Espacio CoWork, hojas de cálculo, suite de reseñas y prospección', 'Planificación de contenido, campañas y flujos del asistente'] },
    command: { description: 'Para agencias, equipos y operadores exigentes', features: ['Todo lo de Growth', 'Sitios ampliados/ilimitados y flujos avanzados', 'Video avanzado, mayor volumen de uso, renderizado prioritario', 'Espacio de equipo, kit de marca, marca blanca, pipeline de ventas', 'Conectores, ruta de API, incorporación dedicada y soporte prioritario'] },
  } },
  pt: { tiers: {
    launch:  { description: 'Para operadores individuais e pequenas empresas', features: ['Espaço de programação com IA: crie, edite, execute, teste, depure e repare código', 'Plataforma em 5 idiomas: EN, PT, ES, PL, RU', '1 site publicado mais ferramentas de otimização', 'Canvas Video Studio com legendas por IA e exportação MP4', 'Espaço de lançamento e otimização de podcasts', 'Avaliações, calendário, prospecção básica e assistente'] },
    growth:  { description: 'Para empresas em crescimento e equipes pequenas', features: ['Tudo do Launch', 'Até 5 sites/projetos, otimização mais profunda', 'Modelos do Video Studio, identidade de marca, maior uso', 'Espaço CoWork, planilhas, suíte de avaliações e prospecção', 'Planejamento de conteúdo, campanhas e fluxos do assistente'] },
    command: { description: 'Para agências, equipes e operadores exigentes', features: ['Tudo do Growth', 'Sites ampliados/ilimitados e fluxos avançados', 'Vídeo avançado, maior volume de uso, renderização prioritária', 'Espaço de equipe, kit de marca, marca branca, pipeline de vendas', 'Conectores, caminho de API, onboarding dedicado e suporte prioritário'] },
  } },
  pl: { tiers: {
    launch:  { description: 'Dla samodzielnych operatorów i małych firm', features: ['Przestrzeń programistyczna AI: twórz, edytuj, uruchamiaj, testuj, debuguj i naprawiaj kod', 'Platforma w 5 językach: EN, PT, ES, PL, RU', '1 opublikowana strona plus narzędzia optymalizacji', 'Canvas Video Studio z napisami AI i eksportem MP4', 'Przestrzeń do uruchamiania i optymalizacji podcastów', 'Opinie, kalendarz, podstawowy outreach i asystent'] },
    growth:  { description: 'Dla rosnących firm i małych zespołów', features: ['Wszystko z Launch', 'Do 5 stron/projektów, głębsza optymalizacja', 'Szablony Video Studio, stylizacja marki, większe zużycie', 'Przestrzeń CoWork, arkusze, pakiet opinii i outreachu', 'Planowanie treści, kampanie i przepływy asystenta'] },
    command: { description: 'Dla agencji, zespołów i wymagających operatorów', features: ['Wszystko z Growth', 'Rozszerzone/nielimitowane strony i zaawansowane przepływy', 'Zaawansowane wideo, większa pula użycia, priorytetowy rendering', 'Przestrzeń zespołu, brand kit, white label, lejek sprzedaży', 'Konektory, ścieżka API, dedykowane wdrożenie i priorytetowe wsparcie'] },
  } },
  ru: { tiers: {
    launch:  { description: 'Для индивидуальных операторов и малого бизнеса', features: ['ИИ-среда разработки: создавайте, редактируйте, запускайте, тестируйте, отлаживайте и исправляйте код', 'Платформа на 5 языках: EN, PT, ES, PL, RU', '1 опубликованный сайт плюс инструменты оптимизации', 'Canvas Video Studio с ИИ-субтитрами и экспортом MP4', 'Пространство для запуска и оптимизации подкастов', 'Отзывы, календарь, базовый аутрич и ассистент'] },
    growth:  { description: 'Для растущего бизнеса и небольших команд', features: ['Всё из Launch', 'До 5 сайтов/проектов, более глубокая оптимизация', 'Шаблоны Video Studio, фирменный стиль, больший объём', 'Пространство CoWork, таблицы, набор отзывов и аутрича', 'Планирование контента, кампании и сценарии ассистента'] },
    command: { description: 'Для агентств, команд и серьёзных операторов', features: ['Всё из Growth', 'Расширенные/безлимитные сайты и продвинутые сценарии', 'Продвинутое видео, больший пул использования, приоритетный рендеринг', 'Командное пространство, бренд-кит, white label, воронка продаж', 'Коннекторы, путь API, выделенный онбординг и приоритетная поддержка'] },
  } },
  de: { tiers: {
    launch:  { description: 'Für Einzelunternehmer und kleine Unternehmen', features: ['KI-Coding-Arbeitsbereich: Code erstellen, bearbeiten, ausführen, testen, debuggen und reparieren', 'Plattform in 5 Sprachen: EN, PT, ES, PL, RU', '1 veröffentlichte Website plus Optimierungstools', 'Canvas Video Studio mit KI-Untertiteln und MP4-Export', 'Arbeitsbereich für Podcast-Start und -Optimierung', 'Bewertungen, Kalender, Basis-Outreach und Assistent'] },
    growth:  { description: 'Für wachsende Unternehmen und kleine Teams', features: ['Alles aus Launch', 'Bis zu 5 Websites/Projekte, tiefere Optimierung', 'Video-Studio-Vorlagen, Marken-Styling, höheres Nutzungsvolumen', 'CoWork-Arbeitsbereich, Tabellen, Bewertungs- & Outreach-Suite', 'Inhaltsplanung, Kampagnen und Assistenten-Workflows'] },
    command: { description: 'Für Agenturen, Teams und anspruchsvolle Anwender', features: ['Alles aus Growth', 'Erweiterte/unbegrenzte Websites und fortgeschrittene Workflows', 'Erweitertes Video, größeres Nutzungskontingent, priorisiertes Rendering', 'Team-Arbeitsbereich, Brand Kit, White Label, Vertriebspipeline', 'Konnektoren, API-Zugang, dediziertes Onboarding & Priority-Support'] },
  } },
  fr: { tiers: {
    launch:  { description: 'Pour les indépendants et les petites entreprises', features: ['Espace de codage IA : créez, modifiez, exécutez, testez, déboguez et réparez du code', 'Plateforme en 5 langues : EN, PT, ES, PL, RU', '1 site web publié et des outils d’optimisation', 'Canvas Video Studio avec sous-titres IA et export MP4', 'Espace de lancement et d\'optimisation de podcast', 'Avis, calendrier, prospection de base et assistant'] },
    growth:  { description: 'Pour les entreprises en croissance et les petites équipes', features: ['Tout ce qu\'inclut Launch', 'Jusqu’à 5 sites/projets, optimisation plus poussée', 'Modèles Video Studio, style de marque, utilisation accrue', 'Espace CoWork, feuilles de calcul, suite d’avis et de prospection', 'Planification de contenu, campagnes et workflows de l’assistant'] },
    command: { description: 'Pour les agences, les équipes et les opérateurs exigeants', features: ['Tout ce qu\'inclut Growth', 'Sites étendus/illimités et workflows avancés', 'Vidéo avancée, volume d’utilisation accru, rendu prioritaire', 'Espace d’équipe, kit de marque, marque blanche, pipeline commercial', 'Connecteurs, accès API, onboarding dédié et support prioritaire'] },
  } },
  it: { tiers: {
    launch:  { description: 'Per professionisti singoli e piccole imprese', features: ['Spazio di coding con AI: crea, modifica, esegui, testa, esegui il debug e ripara il codice', 'Piattaforma in 5 lingue: EN, PT, ES, PL, RU', '1 sito web pubblicato più strumenti di ottimizzazione', 'Canvas Video Studio con sottotitoli AI ed esportazione MP4', 'Spazio di lavoro per lancio e ottimizzazione podcast', 'Recensioni, calendario, outreach di base e assistente'] },
    growth:  { description: 'Per aziende in crescita e piccoli team', features: ['Tutto ciò che è incluso in Launch', 'Fino a 5 siti/progetti, ottimizzazione più approfondita', 'Modelli di Video Studio, stile del brand, utilizzo maggiore', 'Spazio CoWork, fogli di calcolo, suite recensioni e outreach', 'Pianificazione dei contenuti, campagne e flussi dell’assistente'] },
    command: { description: 'Per agenzie, team e operatori professionali', features: ['Tutto ciò che è incluso in Growth', 'Siti estesi/illimitati e flussi di lavoro avanzati', 'Video avanzato, pool di utilizzo più ampio, rendering prioritario', 'Spazio di lavoro per il team, brand kit, white label, pipeline di vendita', 'Connettori, accesso API, onboarding dedicato e supporto prioritario'] },
  } },
  ja: { tiers: {
    launch:  { description: '個人事業主や小規模ビジネス向け', features: ['AI コーディングワークスペース:コードの作成、編集、実行、テスト、デバッグ、修復', '5 言語対応プラットフォーム:EN、PT、ES、PL、RU', '公開ウェブサイト 1 件と最適化ツール', 'AI 字幕と MP4 エクスポートを備えた Canvas Video Studio', 'ポッドキャストの立ち上げと最適化のワークスペース', 'レビュー、カレンダー、基本的なアウトリーチ、アシスタント'] },
    growth:  { description: '成長中のビジネスや小規模チーム向け', features: ['Launch のすべての機能', '最大 5 件のウェブサイト/プロジェクト、より高度な最適化', 'Video Studio テンプレート、ブランドスタイル、より多い利用枠', 'CoWork ワークスペース、スプレッドシート、レビュー&アウトリーチスイート', 'コンテンツ計画、キャンペーン、アシスタントのワークフロー'] },
    command: { description: 'エージェンシー、チーム、本格的な運用者向け', features: ['Growth のすべての機能', '拡張/無制限のウェブサイトと高度なワークフロー', '高度な動画機能、より大きな利用枠、優先レンダリング', 'チームワークスペース、ブランドキット、ホワイトラベル、営業パイプライン', 'コネクタ、API 連携、専任オンボーディング、優先サポート'] },
  } },
  ko: { tiers: {
    launch:  { description: '1인 운영자 및 소규모 비즈니스용', features: ['AI 코딩 작업 공간: 코드 생성, 편집, 실행, 테스트, 디버그 및 복구', '5개 언어 플랫폼: EN, PT, ES, PL, RU', '게시된 웹사이트 1개 및 최적화 도구', 'AI 자막 및 MP4 내보내기를 지원하는 Canvas Video Studio', '팟캐스트 런칭 및 최적화 워크스페이스', '리뷰, 캘린더, 기본 아웃리치 및 어시스턴트'] },
    growth:  { description: '성장하는 비즈니스 및 소규모 팀용', features: ['Launch의 모든 기능', '최대 5개 웹사이트/프로젝트, 심층 최적화', 'Video Studio 템플릿, 브랜드 스타일링, 더 많은 사용량', 'CoWork 작업 공간, 스프레드시트, 리뷰 및 아웃리치 스위트', '콘텐츠 기획, 캠페인 및 어시스턴트 워크플로'] },
    command: { description: '에이전시, 팀 및 전문 운영자용', features: ['Growth의 모든 기능', '확장/무제한 웹사이트 및 고급 워크플로', '고급 비디오, 더 큰 사용량 풀, 우선 렌더링', '팀 작업 공간, 브랜드 키트, 화이트 라벨, 영업 파이프라인', '커넥터, API 경로, 전담 온보딩 및 우선 지원'] },
  } },
  ar: { tiers: {
    launch:  { description: 'للمشغّلين الأفراد والشركات الصغيرة', features: ['مساحة عمل برمجة بالذكاء الاصطناعي: أنشئ الكود وحرّره وشغّله واختبره وصحّح أخطاءه وأصلحه', 'منصة بخمس لغات: EN وPT وES وPL وRU', 'موقع ويب منشور واحد مع أدوات التحسين', 'Canvas Video Studio مع ترجمة نصية بالذكاء الاصطناعي وتصدير MP4', 'مساحة عمل لإطلاق البودكاست وتحسينه', 'التقييمات والتقويم والتواصل الأساسي والمساعد'] },
    growth:  { description: 'للشركات النامية والفرق الصغيرة', features: ['كل ما في Launch', 'حتى 5 مواقع/مشاريع، مع تحسين أعمق', 'قوالب Video Studio، وتنسيق العلامة التجارية، واستخدام أعلى', 'مساحة عمل CoWork، وجداول البيانات، وحزمة التقييمات والتواصل', 'تخطيط المحتوى والحملات وسير عمل المساعد'] },
    command: { description: 'للوكالات والفرق والمشغّلين الجادّين', features: ['كل ما في Growth', 'مواقع موسّعة/غير محدودة وسير عمل متقدم', 'فيديو متقدم، ورصيد استخدام أكبر، وعرض ذو أولوية', 'مساحة عمل للفريق، وحزمة العلامة التجارية، وعلامة بيضاء، ومسار المبيعات', 'موصلات، ومسار API، وتهيئة مخصصة، ودعم ذو أولوية'] },
  } },
}

// ─── Podcast Suite lane ──────────────────────────────────────────────────────
// Real names/prices/checkout are wired in the catalog. No per-tier FEATURE copy
// exists anywhere in the codebase, so features are intentionally left EMPTY here
// rather than fabricated — fill these with real specs and they localize cleanly.
const PODCAST: Record<PricingLocale, LaneCopy> = {
  en: { tiers: {
    indie:   { description: 'For independent podcasters', features: [] },
    pro:     { description: 'For growing shows', features: [] },
    network: { description: 'For multi-show networks', features: [] },
  } },
  es: { tiers: {
    indie:   { description: 'Para podcasters independientes', features: [] },
    pro:     { description: 'Para programas en crecimiento', features: [] },
    network: { description: 'Para redes de varios programas', features: [] },
  } },
  pt: { tiers: {
    indie:   { description: 'Para podcasters independentes', features: [] },
    pro:     { description: 'Para programas em crescimento', features: [] },
    network: { description: 'Para redes de vários programas', features: [] },
  } },
  pl: { tiers: {
    indie:   { description: 'Dla niezależnych podcasterów', features: [] },
    pro:     { description: 'Dla rosnących programów', features: [] },
    network: { description: 'Dla sieci wielu programów', features: [] },
  } },
  ru: { tiers: {
    indie:   { description: 'Для независимых подкастеров', features: [] },
    pro:     { description: 'Для растущих шоу', features: [] },
    network: { description: 'Для сетей из нескольких шоу', features: [] },
  } },
  de: { tiers: {
    indie:   { description: 'Für unabhängige Podcaster', features: [] },
    pro:     { description: 'Für wachsende Shows', features: [] },
    network: { description: 'Für Netzwerke mit mehreren Shows', features: [] },
  } },
  fr: { tiers: {
    indie:   { description: 'Pour les podcasteurs indépendants', features: [] },
    pro:     { description: 'Pour les émissions en croissance', features: [] },
    network: { description: 'Pour les réseaux multi-émissions', features: [] },
  } },
  it: { tiers: {
    indie:   { description: 'Per podcaster indipendenti', features: [] },
    pro:     { description: 'Per show in crescita', features: [] },
    network: { description: 'Per network con più show', features: [] },
  } },
  ja: { tiers: {
    indie:   { description: '個人ポッドキャスター向け', features: [] },
    pro:     { description: '成長中の番組向け', features: [] },
    network: { description: '複数番組のネットワーク向け', features: [] },
  } },
  ko: { tiers: {
    indie:   { description: '독립 팟캐스터용', features: [] },
    pro:     { description: '성장 중인 프로그램용', features: [] },
    network: { description: '여러 프로그램을 운영하는 네트워크용', features: [] },
  } },
  ar: { tiers: {
    indie:   { description: 'لمقدمي البودكاست المستقلين', features: [] },
    pro:     { description: 'للبرامج المتنامية', features: [] },
    network: { description: 'للشبكات متعددة البرامج', features: [] },
  } },
}

function normalizeLocale(lang: string): PricingLocale {
  const short = (lang || 'en').toLowerCase().slice(0, 2)
  return (LOCALES as string[]).includes(short) ? (short as PricingLocale) : 'en'
}

// Single accessor consumed by the storefront. Audit lane is composed from the
// proven auditPricingCopy matrix (descriptions, ✓/❌ feature lines, credits pill,
// top-up line); website/podcast come from the bundles above.
export function getUnifiedPricingCopy(lang: string): UnifiedPricingCopy {
  const loc = normalizeLocale(lang)
  const audit = getAuditPricingCopy(loc as AuditLocale)

  const auditLane: LaneCopy = { tiers: {} }
  for (const id of Object.keys(audit.tiers)) {
    const tc = audit.tiers[id]
    auditLane.tiers[id] = {
      description: tc.description,
      features: tc.features,
      highlight: tc.creditsLabel,
      topup: tc.topupLabel,
    }
  }

  return {
    shared: SHARED[loc],
    lanes: { audit: auditLane, platform: WEBSITE[loc], podcast: PODCAST[loc] },
  }
}
