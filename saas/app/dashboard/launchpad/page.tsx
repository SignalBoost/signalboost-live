'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY = {
  badge:       { en: uiText('generatedUi.u_fb6d0aa2b6867976'), es: '🚀 SIGNALBOOST LAUNCHPAD', pt: '🚀 SIGNALBOOST LAUNCHPAD', pl: '🚀 SIGNALBOOST LAUNCHPAD', ru: '🚀 SIGNALBOOST LAUNCHPAD', de: '🚀 SIGNALBOOST-STARTRAMPE', fr: '🚀 RAMPE DE LANCEMENT SIGNALBOOST', it: '🚀 RAMPA DI LANCIO SIGNALBOOST', ja: '🚀 SIGNALBOOST ローンチパッド', ko: '🚀 SIGNALBOOST 런치패드', ar: '🚀 منصة إطلاق SIGNALBOOST' },
  title1:      { en: uiText('generatedUi.u_863b7ce7fbae71ca'), es: 'Dinos qué quieres', pt: 'Diga-nos o que você quer', pl: 'Powiedz nam co chcesz', ru: 'Расскажите, что хотите', de: 'Sagen Sie uns, was Sie möchten', fr: 'Dites-nous ce que vous voulez', it: 'Dicci cosa desideri', ja: 'ご希望をお聞かせください', ko: '원하는 것을 알려주세요', ar: 'أخبرنا بما تريد' },
  title2:      { en: uiText('generatedUi.u_0fdabe9846bba059'), es: 'construir', pt: 'construir', pl: 'zbudować', ru: 'создать', de: 'zum Erstellen', fr: 'pour créer', it: 'per creare', ja: '構築するには', ko: '구축하려면', ar: 'للبناء' },
  subtitle:    { en: uiText('generatedUi.u_59bc3fddb3f3e7ba'), es: 'Tú traes la idea. SignalBoost ayuda a construirla y lanzarla. Para ayudarte mejor, elige cuánta orientación quieres.', pt: 'Você traz a ideia. SignalBoost ajuda a construir e lançar. Para ajudá-lo melhor, escolha quanta orientação deseja.', pl: 'Ty masz pomysł. SignalBoost pomaga go zbudować i uruchomić. Aby lepiej Ci pomóc, wybierz ile wskazówek chcesz.', ru: 'Вы приносите идею. SignalBoost помогает её создать и запустить. Выберите, сколько руководства вам нужно.', de: 'Sie bringen die Idee mit. SignalBoost hilft, sie zu entwickeln und zu starten. Damit wir Sie besser unterstützen können, wählen Sie, wie viel Anleitung Sie möchten.', fr: 'Vous apportez l’idée. SignalBoost vous aide à la concrétiser et à la lancer. Pour mieux vous accompagner, choisissez le niveau d’accompagnement souhaité.', it: 'Tu porti l’idea. SignalBoost ti aiuta a costruirla e lanciarla. Per aiutarti meglio, scegli quanta guida desideri.', ja: 'アイデアはあなたが持ち込み、SignalBoost がその構築とローンチを支援します。より適切にサポートするため、必要なガイダンスの量を選択してください。', ko: '아이디어는 여러분이 가져오고, SignalBoost가 구축과 출시를 돕습니다. 더 잘 도와드릴 수 있도록 원하는 안내 수준을 선택하세요.', ar: 'أنت تأتي بالفكرة، وSignalBoost يساعدك على بنائها وإطلاقها. لمساعدتك بشكل أفضل، اختر مقدار التوجيه الذي تريده.' },
  step1:       { en: uiText('generatedUi.u_35fb0674e89c900c'), es: '1. ¿Qué quieres lanzar?', pt: '1. O que você quer lançar?', pl: '1. Co chcesz uruchomić?', ru: '1. Что хотите запустить?', de: '1. Was möchten Sie starten?', fr: '1. Que souhaitez-vous lancer ?', it: '1. Cosa vuoi lanciare?', ja: '1. 何をローンチしますか？', ko: '1. 무엇을 출시하시겠습니까?', ar: '1. ما الذي تريد إطلاقه؟' },
  step2:       { en: uiText('generatedUi.u_a99ac6cf2cded0aa'), es: '2. ¿Cómo debería ayudarte SignalBoost?', pt: '2. Como o SignalBoost deve te ajudar?', pl: '2. Jak SignalBoost powinien Ci pomóc?', ru: '2. Как SignalBoost должен вам помочь?', de: '2. Wie soll SignalBoost Ihnen helfen?', fr: '2. Comment SignalBoost doit-il vous aider ?', it: '2. Come dovrebbe aiutarti SignalBoost?', ja: '2. SignalBoost にどのようなサポートを希望しますか？', ko: '2. SignalBoost가 어떻게 도와드릴까요?', ar: '2. كيف تريد أن يساعدك SignalBoost؟' },
  step2sub:    { en: uiText('generatedUi.u_4efe7ee38d277d94'), es: 'Esto ayuda a SignalBoost a ajustar el lenguaje, los pasos y los detalles técnicos mostrados.', pt: 'Isso ajuda o SignalBoost a ajustar a linguagem, as etapas e os detalhes técnicos exibidos.', pl: 'Pomaga to SignalBoost dostosować język, kroki i szczegóły techniczne do Ciebie.', ru: 'Это помогает SignalBoost адаптировать язык, шаги и технические детали для вас.', de: 'So kann SignalBoost die Sprache, die Schritte und die technischen Details anpassen, die Ihnen angezeigt werden.', fr: 'Cela aide SignalBoost à adapter le langage, les étapes et les détails techniques qui vous sont présentés.', it: 'Questo aiuta SignalBoost ad adattare il linguaggio, i passaggi e i dettagli tecnici che ti vengono mostrati.', ja: 'これにより、SignalBoost は表示する言葉遣い、手順、技術的な詳細を調整できます。', ko: '이를 통해 SignalBoost가 표시되는 언어, 단계 및 기술적 세부 정보를 조정할 수 있습니다.', ar: 'يساعد هذا SignalBoost على تعديل اللغة والخطوات والتفاصيل التقنية المعروضة لك.' },
  previewNote: { en: uiText('generatedUi.u_bb4099d4a436eb39'), es: 'SignalBoost usará tu nivel de experiencia seleccionado para mantener los próximos pasos claros y apropiados.', pt: 'SignalBoost usará seu nível de experiência selecionado para manter as próximas etapas claras e apropriadas.', pl: 'SignalBoost użyje wybranego poziomu doświadczenia, aby kolejne kroki były jasne i odpowiednie dla Ciebie.', ru: 'SignalBoost использует выбранный уровень опыта для адаптации следующих шагов.', de: 'SignalBoost verwendet Ihr ausgewähltes Erfahrungsniveau, um die nächsten Schritte klar und passend für Sie zu gestalten.', fr: 'SignalBoost utilisera le niveau d\'expérience sélectionné pour que les prochaines étapes restent claires et adaptées à vous.', it: 'SignalBoost userà il livello di esperienza selezionato per mantenere i prossimi passaggi chiari e adatti a te.', ja: 'SignalBoostは選択された経験レベルに基づき、次のステップをわかりやすく適切なものにします。', ko: 'SignalBoost는 선택한 경험 수준을 바탕으로 다음 단계를 명확하고 적합하게 안내합니다.', ar: 'سيستخدم SignalBoost مستوى الخبرة الذي اخترته لإبقاء الخطوات التالية واضحة ومناسبة لك.' },
  continue:    { en: uiText('generatedUi.u_496267ccc6b01605'), es: 'Continuar →', pt: 'Continuar →', pl: 'Kontynuuj →', ru: 'Продолжить →', de: 'Weiter →', fr: 'Continuer →', it: 'Continua →', ja: '続行 →', ko: '계속 →', ar: 'متابعة →' },
  choosePath:  { en: uiText('generatedUi.u_162c5837506b2d47'), es: 'Elige una ruta y nivel de orientación', pt: 'Escolha um caminho e nível de orientação', pl: 'Wybierz ścieżkę i poziom wskazówek', ru: 'Выберите путь и уровень руководства', de: 'Wählen Sie einen Pfad und eine Anleitungsstufe', fr: 'Choisissez un parcours et un niveau d’accompagnement', it: 'Scegli un percorso e un livello di guida', ja: 'パスとガイダンスレベルを選択', ko: '경로와 안내 수준 선택', ar: 'اختر مسارًا ومستوى إرشاد' },
  stepsIn5:    { en: uiText('generatedUi.u_b7595e2a863957fc'), es: 'pasos', pt: 'passos', pl: 'kroków', ru: 'шагов', de: 'Schritte', fr: 'étapes', it: 'passaggi', ja: 'ステップ', ko: '단계', ar: 'خطوات' },
  buildYour:   { en: uiText('generatedUi.u_8d3e17e88c18acfa'), es: 'Construye tu', pt: 'Construa seu', pl: 'Zbuduj swój', ru: 'Создайте свой', de: 'Erstellen Sie Ihr', fr: 'Créez votre', it: 'Crea il tuo', ja: '構築しよう：', ko: '만들어 보세요:', ar: 'أنشئ' },
  paths: [
    {
      icon: '🏪', id: "business",
      title:   { en: uiText('generatedUi.u_15ac2c642bd5b4ce'), es: 'Pequeño negocio', pt: 'Pequeno negócio', pl: 'Mały biznes', ru: 'Малый бизнес', de: 'Kleinunternehmen', fr: 'Petite entreprise', it: 'Piccole imprese', ja: '中小企業', ko: '소규모 비즈니스', ar: 'الشركات الصغيرة' },
      desc:    { en: uiText('generatedUi.u_92cf32d80923fe18'), es: 'Lanza una panadería, restaurante, agencia de viajes, servicio local y más.', pt: 'Lance uma padaria, restaurante, agência de viagens, serviço local e mais.', pl: 'Uruchom piekarnię, restaurację, agencję turystyczną, lokalną usługę i więcej.', ru: 'Запустите пекарню, ресторан, турагентство, местный сервис и многое другое.', de: 'Starten Sie eine Bäckerei, ein Restaurant, ein Reiseunternehmen, einen lokalen Dienstleister und mehr.', fr: 'Lancez une boulangerie, un restaurant, une agence de voyages, un service local et bien plus.', it: 'Avvia una panetteria, un ristorante, un\'agenzia di viaggi, un servizio locale e altro ancora.', ja: 'ベーカリー、レストラン、旅行会社、地域サービスなどを立ち上げましょう。', ko: '베이커리, 레스토랑, 여행사, 지역 서비스 등을 시작하세요.', ar: 'أطلق مخبزًا أو مطعمًا أو شركة سفر أو خدمة محلية والمزيد.' },
      previewTitle: { en: uiText('generatedUi.u_29eec1ffaaa08830'), es: '🏪 Construye tu negocio en 5 pasos', pt: '🏪 Construa seu negócio em 5 passos', pl: '🏪 Zbuduj swój biznes w 5 krokach', ru: '🏪 Создайте бизнес за 5 шагов', de: '🏪 Bauen Sie Ihr Unternehmen in 5 Schritten auf', fr: '🏪 Développez votre activité en 5 étapes', it: '🏪 Costruisci la tua attività in 5 passaggi', ja: '🏪 5 つのステップでビジネスを構築', ko: '🏪 5단계로 비즈니스 구축하기', ar: '🏪 ابنِ نشاطك التجاري في 5 خطوات' },
      href: "/dashboard/launchpad/business",
      steps: {
        s1: { en: uiText('generatedUi.u_a7d61367de051823'), es: 'Describe tu negocio', pt: 'Descreva seu negócio', pl: 'Opisz swój biznes', ru: 'Опишите свой бизнес', de: 'Beschreiben Sie Ihr Unternehmen', fr: 'Décrivez votre entreprise', it: 'Descrivi la tua attività', ja: 'ビジネスについて説明してください', ko: '비즈니스를 설명하세요', ar: 'صِف نشاطك التجاري' },
        s2: { en: uiText('generatedUi.u_8fea23be7c4319cd'), es: 'Crea el nombre del negocio', pt: 'Crie o nome do negócio', pl: 'Utwórz nazwę firmy', ru: 'Создайте название бизнеса', de: 'Firmennamen erstellen', fr: 'Créer un nom d\'entreprise', it: 'Crea nome aziendale', ja: 'ビジネス名を作成', ko: '비즈니스 이름 만들기', ar: 'إنشاء اسم تجاري' },
        s3: { en: uiText('generatedUi.u_e04c4ae90e211a02'), es: 'Genera el sitio web', pt: 'Gere o site', pl: 'Wygeneruj stronę', ru: 'Создайте сайт', de: 'Website generieren', fr: 'Générer le site web', it: 'Genera sito web', ja: 'ウェブサイトを生成', ko: '웹사이트 생성', ar: 'إنشاء موقع ويب' },
        s4: { en: uiText('generatedUi.u_3f5d875ba35c45e1'), es: 'Prepara el marketing', pt: 'Prepare o marketing', pl: 'Przygotuj marketing', ru: 'Подготовьте маркетинг', de: 'Marketing vorbereiten', fr: 'Préparer le marketing', it: 'Prepara il marketing', ja: 'マーケティングを準備', ko: '마케팅 준비', ar: 'تحضير التسويق' },
        s5: { en: uiText('generatedUi.u_fd88325454c4b8da'), es: 'Lanza el negocio', pt: 'Lance o negócio', pl: 'Uruchom biznes', ru: 'Запустите бизнес', de: 'Unternehmen starten', fr: 'Lancer l’entreprise', it: 'Avvia l’attività', ja: 'ビジネスを開始', ko: '비즈니스 시작', ar: 'إطلاق النشاط التجاري' },
      },
    },
    {
      icon: '🎙️', id: "podcast",
      title:   { en: uiText('generatedUi.u_27a723d62938b468'), es: 'Podcast', pt: 'Podcast', pl: 'Podcast', ru: 'Подкаст', de: 'Podcast', fr: 'Podcast', it: 'Podcast', ja: 'ポッドキャスト', ko: '팟캐스트', ar: 'بودكاست' },
      desc:    { en: uiText('generatedUi.u_2ddf05ad5ed89b45'), es: 'Construye tu podcast paso a paso — incluso si nunca creaste uno.', pt: 'Construa seu podcast passo a passo — mesmo se nunca criou um.', pl: 'Zbuduj swój podcast krok po kroku — nawet jeśli nigdy tego nie robiłeś.', ru: 'Создайте подкаст пошагово — даже если никогда не делали этого.', de: 'Erstellen Sie Ihren Podcast in geführten Schritten – auch wenn Sie noch nie einen erstellt haben.', fr: 'Créez votre podcast en étapes guidées, même si vous n\'en avez jamais créé.', it: 'Crea il tuo podcast con passaggi guidati, anche se non ne hai mai creato uno.', ja: 'ガイド付きのステップでポッドキャストを作成できます。初めてでも大丈夫です。', ko: '가이드 단계에 따라 팟캐스트를 만들어 보세요. 한 번도 만들어 본 적이 없어도 괜찮습니다.', ar: 'أنشئ البودكاست الخاص بك عبر خطوات موجّهة — حتى لو لم تنشئ واحدًا من قبل.' },
      previewTitle: { en: uiText('generatedUi.u_56b661ee66b3d892'), es: '🎙️ Construye tu podcast en 5 pasos', pt: '🎙️ Construa seu podcast em 5 passos', pl: '🎙️ Zbuduj swój podcast w 5 krokach', ru: '🎙️ Создайте подкаст за 5 шагов', de: '🎙️ Erstellen Sie Ihren Podcast in 5 Schritten', fr: '🎙️ Créez votre podcast en 5 étapes', it: '🎙️ Crea il tuo podcast in 5 passaggi', ja: '🎙️ 5 ステップでポッドキャストを作成', ko: '🎙️ 5단계로 팟캐스트 만들기', ar: '🎙️ أنشئ البودكاست الخاص بك في 5 خطوات' },
      href: "/dashboard/launchpad/podcast",
      steps: {
        s1: { en: uiText('generatedUi.u_4f543b9630f6dcca'), es: 'Elige el tema de tu podcast', pt: 'Escolha o tema do seu podcast', pl: 'Wybierz temat podcastu', ru: 'Выберите тему подкаста', de: 'Wählen Sie Ihr Podcast-Thema', fr: 'Choisissez le sujet de votre podcast', it: 'Scegli l’argomento del tuo podcast', ja: 'ポッドキャストのテーマを選択', ko: '팟캐스트 주제를 선택하세요', ar: 'اختر موضوع البودكاست' },
        s2: { en: uiText('generatedUi.u_883e6f7baf4a47c7'), es: 'Elige el nombre de tu podcast', pt: 'Escolha o nome do podcast', pl: 'Wybierz nazwę podcastu', ru: 'Выберите название подкаста', de: 'Wählen Sie den Namen Ihres Podcasts', fr: 'Choisissez le nom de votre podcast', it: 'Scegli il nome del tuo podcast', ja: 'ポッドキャスト名を決めましょう', ko: '팟캐스트 이름을 정하세요', ar: 'اختر اسم البودكاست الخاص بك' },
        s3: { en: uiText('generatedUi.u_f37f94d6845222b6'), es: 'Crea ideas para el primer episodio', pt: 'Crie ideias para o primeiro episódio', pl: 'Stwórz pomysły na pierwszy odcinek', ru: 'Создайте идеи для первого эпизода', de: 'Ideen für die erste Episode erstellen', fr: 'Créer des idées pour le premier épisode', it: 'Crea idee per il primo episodio', ja: '最初のエピソードのアイデアを作成', ko: '첫 에피소드 아이디어 만들기', ar: 'إنشاء أفكار للحلقة الأولى' },
        s4: { en: uiText('generatedUi.u_b2a3221048ff7f3e'), es: 'Genera tu página de podcast', pt: 'Gere sua página de podcast', pl: 'Wygeneruj stronę podcastu', ru: 'Создайте страницу подкаста', de: 'Ihre Podcast-Seite generieren', fr: 'Générez votre page de podcast', it: 'Genera la tua pagina podcast', ja: 'ポッドキャストページを生成', ko: '팟캐스트 페이지 생성', ar: 'أنشئ صفحة البودكاست الخاصة بك' },
        s5: { en: uiText('generatedUi.u_5b2dc447a8de196c'), es: 'Lanza tu programa', pt: 'Lance seu programa', pl: 'Uruchom swój program', ru: 'Запустите шоу', de: 'Starten Sie Ihre Show', fr: 'Lancez votre émission', it: 'Lancia il tuo show', ja: '番組をローンチ', ko: '쇼 시작하기', ar: 'أطلق برنامجك' },
      },
    },
    {
      icon: '🎬', id: "creator",
      title:   { en: uiText('generatedUi.u_9b3fb4ae093a349d'), es: 'Marca de Creador', pt: 'Marca de Criador', pl: 'Marka twórcy', ru: 'Бренд создателя', de: 'Creator-Marke', fr: 'Marque de créateur', it: 'Brand del creator', ja: 'クリエイターブランド', ko: '크리에이터 브랜드', ar: 'علامة صانع المحتوى' },
      desc:    { en: uiText('generatedUi.u_af75680280e95cba'), es: 'Construye un ecosistema de creador de contenido y crece tu audiencia.', pt: 'Construa um ecossistema de criador de conteúdo e cresça sua audiência.', pl: 'Zbuduj ekosystem twórcy treści i rozwijaj widownię.', ru: 'Создайте экосистему контент-создателя и развивайте аудиторию.', de: 'Bauen Sie ein Ökosystem aus Content-Creatorn auf und vergrößern Sie Ihr Publikum.', fr: 'Créez un écosystème de créateurs de contenu et développez votre audience.', it: 'Crea un ecosistema di content creator e fai crescere il tuo pubblico.', ja: 'コンテンツクリエイターのエコシステムを構築し、オーディエンスを拡大します。', ko: '콘텐츠 크리에이터 생태계를 구축하고 오디언스를 확대하세요.', ar: 'ابنِ منظومة من صنّاع المحتوى ونمِّ جمهورك.' },
      previewTitle: { en: uiText('generatedUi.u_ac9abd29460e7607'), es: '🎬 Construye tu marca de creador en 5 pasos', pt: '🎬 Construa sua marca de criador em 5 passos', pl: '🎬 Zbuduj markę twórcy w 5 krokach', ru: '🎬 Создайте бренд создателя за 5 шагов', de: '🎬 Bauen Sie Ihre Creator-Marke in 5 Schritten auf', fr: '🎬 Créez votre marque de créateur en 5 étapes', it: '🎬 Costruisci il tuo brand da creator in 5 passaggi', ja: '🎬 5 ステップでクリエイターブランドを構築', ko: '🎬 5단계로 크리에이터 브랜드 구축하기', ar: '🎬 ابنِ علامتك التجارية كصانع محتوى في 5 خطوات' },
      href: "/dashboard/launchpad/creator",
      steps: {
        s1: { en: uiText('generatedUi.u_12633a3c05124331'), es: 'Define tu nicho de creador', pt: 'Defina seu nicho de criador', pl: 'Zdefiniuj swoją niszę twórcy', ru: 'Определите вашу нишу создателя', de: 'Definieren Sie Ihre Creator-Nische', fr: 'Définissez votre niche de créateur', it: 'Definisci la tua nicchia da creator', ja: 'クリエイターとしてのニッチを定義', ko: '크리에이터 틈새 정의', ar: 'حدّد مجالك المتخصص كصانع محتوى' },
        s2: { en: uiText('generatedUi.u_aaa4091acfa051e9'), es: 'Construye tu sitio de creador', pt: 'Construa seu site de criador', pl: 'Zbuduj swoją stronę twórcy', ru: 'Создайте сайт создателя', de: 'Erstellen Sie Ihre Creator-Website', fr: 'Créez votre site de créateur', it: 'Crea il tuo sito da creator', ja: 'クリエイターサイトを構築', ko: '크리에이터 사이트 구축', ar: 'أنشئ موقعك كصانع محتوى' },
        s3: { en: uiText('generatedUi.u_e6b4b7d5c4fa2d5b'), es: 'Genera audio nativo', pt: 'Gere áudio nativo', pl: 'Wygeneruj natywne audio', ru: 'Создайте нативное аудио', de: 'Natives Audio generieren', fr: 'Générer un audio natif', it: 'Genera audio nativo', ja: 'ネイティブ音声を生成', ko: '네이티브 오디오 생성', ar: 'إنشاء صوت أصلي' },
        s4: { en: uiText('generatedUi.u_a38ec6742c1f26f3'), es: 'Crea videos cortos', pt: 'Crie vídeos curtos', pl: 'Twórz krótkie filmy', ru: 'Создайте короткие видео', de: 'Kurzvideos erstellen', fr: 'Créer des vidéos courtes', it: 'Crea video brevi', ja: 'ショート動画を作成', ko: '숏폼 동영상 만들기', ar: 'إنشاء مقاطع فيديو قصيرة' },
        s5: { en: uiText('generatedUi.u_a4984048a13ac9e4'), es: 'Crece con promoción', pt: 'Cresça com promoção', pl: 'Rozwijaj się z promocją', ru: 'Развивайтесь с продвижением', de: 'Mit Werbung wachsen', fr: 'Développez-vous grâce à la promotion', it: 'Cresci con la promozione', ja: 'プロモーションで成長', ko: '프로모션으로 성장하기', ar: 'انمُ عبر الترويج' },
      },
    },
    {
      icon: '🛒', id: "store",
      title:   { en: uiText('generatedUi.u_c50970c1903db9ae'), es: 'Tienda Online', pt: 'Loja Online', pl: 'Sklep Online', ru: 'Интернет-магазин', de: 'Onlineshop', fr: 'Boutique en ligne', it: 'Negozio online', ja: 'オンラインストア', ko: '온라인 스토어', ar: 'المتجر الإلكتروني' },
      desc:    { en: uiText('generatedUi.u_3a8d010dfc53f7ec'), es: 'Vende productos online con soporte de sitio web y marketing.', pt: 'Venda produtos online com suporte de site e marketing.', pl: 'Sprzedawaj produkty online z wsparciem strony i marketingu.', ru: 'Продавайте товары онлайн с поддержкой сайта и маркетинга.', de: 'Verkaufen Sie Produkte online mit Website- und Marketing-Unterstützung.', fr: 'Vendez des produits en ligne avec un accompagnement site web et marketing.', it: 'Vendi prodotti online con supporto per sito web e marketing.', ja: 'Web サイトとマーケティングのサポートで商品をオンライン販売します。', ko: '웹사이트 및 마케팅 지원으로 제품을 온라인에서 판매하세요.', ar: 'بِع المنتجات عبر الإنترنت مع دعم للموقع الإلكتروني والتسويق.' },
      previewTitle: { en: uiText('generatedUi.u_5e5fcdd64ae83574'), es: '🛒 Construye tu tienda online en 5 pasos', pt: '🛒 Construa sua loja online em 5 passos', pl: '🛒 Zbuduj sklep online w 5 krokach', ru: '🛒 Создайте интернет-магазин за 5 шагов', de: '🛒 Erstellen Sie Ihren Onlineshop in 5 Schritten', fr: '🛒 Créez votre boutique en ligne en 5 étapes', it: '🛒 Crea il tuo negozio online in 5 passaggi', ja: '🛒 5 ステップでオンラインストアを構築', ko: '🛒 5단계로 온라인 스토어 만들기', ar: '🛒 أنشئ متجرك الإلكتروني في 5 خطوات' },
      href: "/dashboard/launchpad/store",
      steps: {
        s1: { en: uiText('generatedUi.u_559658222419eb16'), es: 'Describe tus productos', pt: 'Descreva seus produtos', pl: 'Opisz swoje produkty', ru: 'Опишите ваши товары', de: 'Beschreiben Sie Ihre Produkte', fr: 'Décrivez vos produits', it: 'Descrivi i tuoi prodotti', ja: '製品を説明してください', ko: '제품을 설명하세요', ar: 'صف منتجاتك' },
        s2: { en: uiText('generatedUi.u_65e76c2255bbbeae'), es: 'Construye tu tienda', pt: 'Construa sua loja', pl: 'Zbuduj swój sklep', ru: 'Создайте витрину магазина', de: 'Erstellen Sie Ihr Schaufenster', fr: 'Créez votre vitrine', it: 'Crea la tua vetrina', ja: 'ストアフロントを構築', ko: '스토어프론트 만들기', ar: 'أنشئ واجهة متجرك' },
        s3: { en: uiText('generatedUi.u_3b32394fb127f45b'), es: 'Crea videos de productos', pt: 'Crie vídeos de produtos', pl: 'Twórz filmy o produktach', ru: 'Создайте видео о товарах', de: 'Produktvideos erstellen', fr: 'Créer des vidéos produit', it: 'Crea video di prodotto', ja: '製品動画を作成', ko: '제품 동영상 만들기', ar: 'إنشاء مقاطع فيديو للمنتجات' },
        s4: { en: uiText('generatedUi.u_fc3af37c88433a1e'), es: 'Recopila reseñas de productos', pt: 'Colete avaliações de produtos', pl: 'Zbieraj opinie o produktach', ru: 'Соберите отзывы о товарах', de: 'Produktbewertungen sammeln', fr: 'Collecter des avis produits', it: 'Raccogli recensioni dei prodotti', ja: '製品レビューを収集', ko: '제품 리뷰 수집', ar: 'جمع مراجعات المنتجات' },
        s5: { en: uiText('generatedUi.u_f7c134e65f094209'), es: 'Lanza el marketing', pt: 'Lance o marketing', pl: 'Uruchom marketing', ru: 'Запустите маркетинг', de: 'Marketing starten', fr: 'Lancer le marketing', it: 'Avvia il marketing', ja: 'マーケティングを開始', ko: '마케팅 시작', ar: 'إطلاق التسويق' },
      },
    },
  ],
  experiences: [
    {
      id: "guided", icon: '🌱',
      title: { en: uiText('generatedUi.u_b91d958acac03ba3'), es: 'Guiado', pt: 'Guiado', pl: 'Guided', ru: 'С руководством', de: 'Geführt', fr: 'Guidé', it: 'Guidato', ja: 'ガイド付き', ko: '가이드형', ar: 'موجَّه' },
      desc:  { en: uiText('generatedUi.u_a76e4217d7eac852'), es: 'Mantenlo simple. Guíame por cada paso y ocúpate de las partes técnicas.', pt: 'Mantenha simples. Me guie por cada etapa e cuide das partes técnicas.', pl: 'Prosto. Przeprowadź mnie przez każdy krok i zajmij się częściami technicznymi.', ru: 'Просто. Проведите меня по каждому шагу и займитесь техническими частями.', de: 'Halten Sie es einfach. Führen Sie mich durch jeden Schritt und übernehmen Sie die technischen Teile.', fr: 'Faites simple. Guidez-moi à chaque étape et occupez-vous des aspects techniques.', it: 'Mantienilo semplice. Guidami passo dopo passo e occupati delle parti tecniche.', ja: 'シンプルにしてください。各ステップを案内し、技術的な部分は任せます。', ko: '간단하게 해 주세요. 각 단계를 안내하고 기술적인 부분은 처리해 주세요.', ar: 'اجعل الأمر بسيطًا. أرشدني خلال كل خطوة وتولَّ الجوانب التقنية.' },
    },
    {
      id: "assisted", icon: '⚙️',
      title: { en: uiText('generatedUi.u_7c090185ba9c811f'), es: 'Asistido', pt: 'Assistido', pl: 'Wspomagany', ru: 'С поддержкой', de: 'Unterstützt', fr: 'Assisté', it: 'Assistito', ja: '支援あり', ko: '지원됨', ar: 'بمساعدة' },
      desc:  { en: uiText('generatedUi.u_d33ae422826df085'), es: 'Guíame, pero déjame tomar algunas decisiones por el camino.', pt: 'Me guie, mas deixe-me tomar algumas decisões ao longo do caminho.', pl: 'Prowadź mnie, ale pozwól mi podejmować niektóre decyzje.', ru: 'Ведите меня, но позвольте принимать некоторые решения.', de: 'Leiten Sie mich an, aber lassen Sie mich unterwegs einige Entscheidungen treffen.', fr: 'Guidez-moi, mais laissez-moi prendre certaines décisions en cours de route.', it: 'Guidami, ma lasciami prendere alcune decisioni lungo il percorso.', ja: 'ガイドしてほしいですが、途中でいくつかの判断は自分で行いたいです。', ko: '안내해 주되, 진행하면서 일부 결정은 제가 내릴 수 있게 해 주세요.', ar: 'أرشدني، لكن دعني أتخذ بعض القرارات على طول الطريق.' },
    },
    {
      id: "power", icon: '🚀',
      title: { en: uiText('generatedUi.u_1a246f3a818858a7'), es: 'Usuario avanzado', pt: 'Usuário avançado', pl: 'Zaawansowany', ru: 'Опытный пользователь', de: 'Power-User', fr: 'Utilisateur avancé', it: 'Utente avanzato', ja: 'パワーユーザー', ko: '파워 유저', ar: 'مستخدم متقدم' },
      desc:  { en: uiText('generatedUi.u_56118905ba6598b2'), es: 'Muestra opciones avanzadas y dame más control técnico.', pt: 'Mostre opções avançadas e me dê mais controle técnico.', pl: 'Pokaż zaawansowane opcje i daj mi więcej kontroli technicznej.', ru: 'Покажите расширенные параметры и дайте больше технического контроля.', de: 'Erweiterte Optionen anzeigen und mir mehr technische Kontrolle geben.', fr: 'Afficher les options avancées et me donner plus de contrôle technique.', it: 'Mostra opzioni avanzate e dammi più controllo tecnico.', ja: '詳細オプションを表示し、より細かな技術的制御を可能にします。', ko: '고급 옵션을 표시하고 더 많은 기술적 제어 권한을 주세요.', ar: 'إظهار الخيارات المتقدمة ومنحي مزيدًا من التحكم التقني.' },
    },
  ],
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

export default function LaunchpadPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang

  const [selected, setSelected]     = useState('')
  const [experience, setExperience] = useState('')
  const previewRef                  = useRef<HTMLDivElement>(null)

  const selectedPath = COPY.paths.find(p => p.id === selected)
  const canContinue  = Boolean(selectedPath && experience)

  // Selecting a path is a real action — bring its 5-step preview into view
  // so the click visibly does something and the Continue button is found.
  useEffect(() => {
    if (selectedPath) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selected, experience, selectedPath])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: 'var(--text-primary)', display: 'grid', gap: 22 }}>

      <div style={{ minHeight: 'calc(100vh - 125px)', display: 'grid', gap: 22, alignContent: 'start' }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: '5px 12px', borderRadius: 999, background: 'rgba(255,195,0,.1)', border: '1px solid rgba(255,195,0,.22)', color: '#ffc300', fontWeight: 900, fontSize: 10, letterSpacing: '.1em', marginBottom: 10 }}>
          {c(COPY.badge, l)}
        </div>
        <h1 style={{ fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: 950, lineHeight: 1.05, margin: '0 0 8px', letterSpacing: '-.045em' }}>
          {c(COPY.title1, l)} <span style={{ color: '#ffc300' }}>{c(COPY.title2, l)}</span>
        </h1>
        <p style={{ maxWidth: 640, margin: '0 auto', color: 'rgba(255,255,255,.55)', lineHeight: 1.6, fontSize: 13 }}>{c(COPY.subtitle, l)}</p>
      </div>

      {/* Step 1 — path */}
      <section>
        <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', marginBottom: 16 }}>{c(COPY.step1, l)}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {COPY.paths.map(path => {
            const active = selected === path.id
            return (
              <button key={path.id} onClick={() => setSelected(path.id)} style={{ cursor: 'pointer', padding: 16, borderRadius: 18, background: active ? 'rgba(255,195,0,.08)' : 'rgba(255,255,255,.03)', border: active ? '1px solid rgba(255,195,0,.42)' : '1px solid rgba(255,255,255,.09)', transition: 'all .2s', color: '#fff', textAlign: 'start', boxShadow: active ? '0 0 32px rgba(255,195,0,.12)' : 'none' }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{path.icon}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>{c(path.title, l)}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.5)', margin: 0 }}>{c(path.desc, l)}</p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Step 2 — experience */}
      <section>
        <h2 style={{ fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 6px' }}>{c(COPY.step2, l)}</h2>
        <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, lineHeight: 1.6, maxWidth: 620, margin: '0 0 16px' }}>{c(COPY.step2sub, l)}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {COPY.experiences.map(level => {
            const active = experience === level.id
            return (
              <button key={level.id} onClick={() => setExperience(level.id)} style={{ cursor: 'pointer', padding: 16, borderRadius: 18, background: active ? 'rgba(59,130,246,.1)' : 'rgba(255,255,255,.03)', border: active ? '1px solid rgba(59,130,246,.44)' : '1px solid rgba(255,255,255,.09)', transition: 'all .2s', color: '#fff', textAlign: 'start', boxShadow: active ? '0 0 28px rgba(59,130,246,.14)' : 'none' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{level.icon}</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800 }}>{c(level.title, l)}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,.5)', margin: 0 }}>{c(level.desc, l)}</p>
              </button>
            )
          })}
        </div>
      </section>

      </div>

      {/* Preview — second screen */}
      {selectedPath && (
        <div ref={previewRef} style={{ borderTop: '1px solid rgba(255,195,0,.3)', paddingTop: 22, scrollMarginTop: 80 }}>
          <h2 style={{ fontSize: 'clamp(16px,2.5vw,20px)', fontWeight: 900, margin: '0 0 20px', letterSpacing: '-.02em' }}>{c(selectedPath.previewTitle, l)}</h2>
          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            {(['s1','s2','s3','s4','s5'] as const).map((sk, i) => (
              <div key={sk} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,195,0,.1)', border: '1px solid rgba(255,195,0,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#ffc300', fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
                <span style={{ color: 'rgba(255,255,255,.75)', fontSize: 14 }}>{c((selectedPath.steps as any)[sk], l)}</span>
              </div>
            ))}
          </div>

          {experience && (
            <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 14, background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.22)', color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: 1.6 }}>
              {c(COPY.previewNote, l)}
            </div>
          )}

          {canContinue ? (
            <Link href={`${selectedPath.href}?experience=${experience}`} className="sb-button-primary" style={{ display: 'inline-flex', fontSize: 15 }}>
              {c(COPY.continue, l)}
            </Link>
          ) : (
            <span aria-disabled="true" style={{ display: 'inline-block', padding: '13px 28px', borderRadius: 999, background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.3)', fontWeight: 900, border: 'none', cursor: 'not-allowed', fontSize: 14 }}>
              {c(COPY.choosePath, l)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
