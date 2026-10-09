// saas/app/dashboard/outreach/discovery/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const PLATFORMS = ['manual', 'google', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'telegram', 'wechat', 'reddit', 'website', 'directory']
const CATEGORIES = ['company', 'affiliate', 'media']

type DiscoveryCopy = {
  eyebrow: string; title: string; subtitle: string; urlLabel: string; nameLabel: string
  sourceLabel: string; categoryLabel: string; notesLabel: string; urlPlaceholder: string
  namePlaceholder: string; notesPlaceholder: string; missingUrl: string; analyzeError: string
  offerLabel: string; offerPlaceholder: string
  campaignLabel: string; campaignNone: string; campaignCustom: string; campaignHint: string
  genericError: string; analyzing: string; analyzeButton: string; viewContacts: string
  leadQueued: string; newLead: string; draftFirstTouch: string; reviewContacts: string
  openEngine: string; generateDeck: string; generatingDeck: string; deckError: string
  platforms: Record<string, string>; categories: Record<string, string>
}

const COPY: Record<string, DiscoveryCopy> = {
  en: {
    eyebrow: uiText('generatedUi.u_80fc402133201fbe'), title: uiText('generatedUi.u_fd218a2f0aee3625'),
    subtitle: uiText('generatedUi.u_9fc5b09b58b6a40a'),
    urlLabel: uiText('generatedUi.u_6b8429a51816b620'), nameLabel: uiText('generatedUi.u_42aa58c476c7087c'),
    sourceLabel: uiText('generatedUi.u_0e570ca6fabe24f9'), categoryLabel: uiText('generatedUi.u_668d40509d247f7a'), notesLabel: uiText('generatedUi.u_a8f8518f0a46a5a8'),
    urlPlaceholder: uiText('generatedUi.u_100680ad546ce6a5'), namePlaceholder: uiText('generatedUi.u_0879a2680a28956d'),
    notesPlaceholder: uiText('generatedUi.u_474f51f3ea4e5a09'),
    missingUrl: uiText('generatedUi.u_a677bab43f023ada'),
    campaignLabel: uiText('generatedUi.u_eb39a9b59ea7c14b'), campaignNone: uiText('generatedUi.u_54b5d3195dc6949f'), campaignCustom: uiText('generatedUi.u_08c9dd87e8f29cbf'), campaignHint: uiText('generatedUi.u_9d6b41c549e48d71'),
    offerLabel: uiText('generatedUi.u_76f29e11f9ae1412'), offerPlaceholder: uiText('generatedUi.u_bf00f2d6ac053df7'),
    analyzeError: uiText('generatedUi.u_bd97a28105b09f69'), genericError: uiText('generatedUi.u_3ccd9d6586ef9143'),
    analyzing: uiText('generatedUi.u_89b633adede66a05'), analyzeButton: uiText('generatedUi.u_336933b3829fa0ba'), viewContacts: uiText('generatedUi.u_537651bc1ab0a1f3'),
    leadQueued: uiText('generatedUi.u_5f6b7a665b469a51'), newLead: uiText('generatedUi.u_fa865e07adc96fa0'), draftFirstTouch: uiText('generatedUi.u_e0a9aaad5ad30d23'),
    reviewContacts: uiText('generatedUi.u_7bbeb237d3455e81'), openEngine: uiText('generatedUi.u_ab3746fe67822a78'),
    generateDeck: uiText('generatedUi.u_a37f7e2c95754f91'), generatingDeck: uiText('generatedUi.u_ea34db4b205bc3d7'), deckError: uiText('generatedUi.u_eadf4b5082e2a3ae'),
    platforms: { manual: uiText('generatedUi.u_b0b9fe24ffa96291'), google: uiText('generatedUi.u_ce770667e5f9b0d8'), facebook: uiText('generatedUi.u_d41f5b4977ee05c6'), instagram: uiText('generatedUi.u_bad57ef7837c8e6b'), linkedin: uiText('generatedUi.u_dd84425b72da12c6'), tiktok: uiText('generatedUi.u_1bb6fcfbf1368a7b'), youtube: uiText('generatedUi.u_fb7accfff8c6f8ea'), telegram: uiText('generatedUi.u_acdd1e734125f341'), wechat: uiText('generatedUi.u_b583907ae9880000'), reddit: uiText('generatedUi.u_eb0050f72303bcdb'), website: uiText('generatedUi.u_b5a229ac8becc603'), directory: uiText('generatedUi.u_c8f84c3c5378b920') },
    categories: { company: uiText('generatedUi.u_de4743c879734dc3'), affiliate: uiText('generatedUi.u_c77364df760e0e13'), media: uiText('generatedUi.u_b638959dce9fcad1') },
  },
  es: {
    eyebrow: 'Descubrimiento', title: 'Encuentra un negocio y deja que la IA prepare la prospección.',
    subtitle: 'Pega un sitio público, perfil de Google o página social. SignalBoost analiza el negocio, predice sus necesidades y coloca un lead listo para revisar en la cola de contactos.',
    urlLabel: 'URL o perfil del negocio *', nameLabel: 'Nombre del negocio (opcional)',
    sourceLabel: 'Fuente', categoryLabel: 'Tipo de prospección', notesLabel: 'Texto público / notas (opcional)',
    urlPlaceholder: 'https://ejemplo.com', namePlaceholder: 'ej.: Luna Travel',
    notesPlaceholder: 'Pega una bio, reseñas o cualquier cosa que describa lo que hacen.',
    missingUrl: 'Agrega una URL o enlace de perfil del negocio para analizar.',
    campaignLabel: 'Campaña activa', campaignNone: 'Ninguna — vista previa de la plataforma SignalBoost', campaignCustom: 'Personalizado (escríbelo abajo)', campaignHint: 'El borrador usa el brief de esta campaña, el mismo que usa el worker en segundo plano.',
    offerLabel: '¿Qué estás vendiendo? (vacío = vista previa de la plataforma SignalBoost)', offerPlaceholder: 'p. ej. Self-Healing Supervisor — supervisión de incidentes alojada por el cliente con remediación aprobada por humanos',
    analyzeError: 'No se pudo analizar este lead.', genericError: 'Algo salió mal. Inténtalo de nuevo.',
    analyzing: 'Analizando…', analyzeButton: 'Analizar y poner lead en cola', viewContacts: 'Ver cola de contactos',
    leadQueued: 'Lead en cola', newLead: 'Nuevo lead', draftFirstTouch: 'Primer contacto en borrador',
    reviewContacts: 'Revisar en contactos', openEngine: 'Abrir motor',
    generateDeck: 'Generar presentación', generatingDeck: 'Creando presentación…', deckError: 'No se pudo generar la presentación.',
    platforms: { manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Sitio web', directory: 'Directorio' },
    categories: { company: 'Empresa', affiliate: 'Afiliado / Socio', media: 'Plataforma de Medios' },
  },
  pt: {
    eyebrow: 'Descoberta', title: 'Encontre um negócio e deixe a IA preparar a prospecção.',
    subtitle: 'Cole um site público, perfil do Google ou página social. O SignalBoost analisa o negócio, prevê suas necessidades e coloca um lead pronto para revisão na fila de contatos.',
    urlLabel: 'URL ou perfil do negócio *', nameLabel: 'Nome do negócio (opcional)',
    sourceLabel: 'Fonte', categoryLabel: 'Tipo de prospecção', notesLabel: 'Texto público / notas (opcional)',
    urlPlaceholder: 'https://exemplo.com', namePlaceholder: 'ex.: Luna Travel',
    notesPlaceholder: 'Cole uma bio, avaliações ou qualquer coisa que descreva o que eles fazem.',
    missingUrl: 'Adicione uma URL ou link de perfil do negócio para analisar.',
    campaignLabel: 'Campanha ativa', campaignNone: 'Nenhuma — prévia da plataforma SignalBoost', campaignCustom: 'Personalizado (digite abaixo)', campaignHint: 'O rascunho usa o brief desta campanha, o mesmo que o worker em segundo plano usa.',
    offerLabel: 'O que você está vendendo? (vazio = prévia da plataforma SignalBoost)', offerPlaceholder: 'ex.: Self-Healing Supervisor — supervisão de incidentes hospedada pelo cliente com remediação aprovada por humanos',
    analyzeError: 'Não foi possível analisar este lead.', genericError: 'Algo deu errado. Tente novamente.',
    analyzing: 'Analisando…', analyzeButton: 'Analisar e colocar lead na fila', viewContacts: 'Ver fila de contatos',
    leadQueued: 'Lead na fila', newLead: 'Novo lead', draftFirstTouch: 'Primeiro contato em rascunho',
    reviewContacts: 'Revisar em contatos', openEngine: 'Abrir motor',
    generateDeck: 'Gerar apresentação', generatingDeck: 'Criando apresentação…', deckError: 'Não foi possível gerar a apresentação.',
    platforms: { manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Site', directory: 'Diretório' },
    categories: { company: 'Empresa', affiliate: 'Afiliado / Parceiro', media: 'Plataforma de Mídia' },
  },
  pl: {
    eyebrow: 'Odkrywanie', title: 'Znajdź firmę i pozwól AI przygotować outreach.',
    subtitle: 'Wklej publiczną stronę, profil Google albo stronę społecznościową. SignalBoost analizuje firmę, przewiduje jej potrzeby i dodaje lead do kolejki kontaktów.',
    urlLabel: 'URL firmy lub profil *', nameLabel: 'Nazwa firmy (opcjonalnie)',
    sourceLabel: 'Źródło', categoryLabel: 'Typ outreachu', notesLabel: 'Tekst publiczny / notatki (opcjonalnie)',
    urlPlaceholder: 'https://przyklad.com', namePlaceholder: 'np. Luna Travel',
    notesPlaceholder: 'Wklej bio, opinie albo opis tego, czym się zajmują.',
    missingUrl: 'Dodaj URL firmy lub link do profilu, aby przeanalizować.',
    campaignLabel: 'Aktywna kampania', campaignNone: 'Brak — podgląd platformy SignalBoost', campaignCustom: 'Własne (wpisz poniżej)', campaignHint: 'Wersja robocza korzysta z briefu tej kampanii — tego samego, którego używa worker.',
    offerLabel: 'Co sprzedajesz? (puste = podgląd platformy SignalBoost)', offerPlaceholder: 'np. Self-Healing Supervisor — nadzór nad incydentami hostowany u klienta z remediacją zatwierdzaną przez człowieka',
    analyzeError: 'Nie można przeanalizować tego leada.', genericError: 'Coś poszło nie tak. Spróbuj ponownie.',
    analyzing: 'Analizowanie…', analyzeButton: 'Analizuj i dodaj lead', viewContacts: 'Zobacz kolejkę kontaktów',
    leadQueued: 'Lead dodany', newLead: 'Nowy lead', draftFirstTouch: 'Szkic pierwszego kontaktu',
    reviewContacts: 'Sprawdź w kontaktach', openEngine: 'Otwórz silnik',
    generateDeck: 'Wygeneruj prezentację', generatingDeck: 'Tworzenie prezentacji…', deckError: 'Nie można wygenerować prezentacji.',
    platforms: { manual: 'Manualnie', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Strona', directory: 'Katalog' },
    categories: { company: 'Firma', affiliate: 'Partner / Afiliacja', media: 'Platforma medialna' },
  },
  ru: {
    eyebrow: 'Поиск', title: 'Найдите компанию и позвольте AI подготовить аутрич.',
    subtitle: 'Вставьте публичный сайт, профиль Google или социальную страницу. SignalBoost анализирует бизнес, прогнозирует его потребности и добавляет lead в очередь контактов.',
    urlLabel: 'URL компании или профиль *', nameLabel: 'Название компании (необязательно)',
    sourceLabel: 'Источник', categoryLabel: 'Тип аутрича', notesLabel: 'Публичный текст / заметки (необязательно)',
    urlPlaceholder: 'https://example.com', namePlaceholder: 'например: Luna Travel',
    notesPlaceholder: 'Вставьте био, отзывы или описание того, чем они занимаются.',
    missingUrl: 'Добавьте URL компании или ссылку на профиль для анализа.',
    campaignLabel: 'Активная кампания', campaignNone: 'Нет — превью платформы SignalBoost', campaignCustom: 'Своё (введите ниже)', campaignHint: 'Черновик использует бриф этой кампании — тот же, что и фоновый worker.',
    offerLabel: 'Что вы продаёте? (пусто — превью платформы SignalBoost)', offerPlaceholder: 'напр. Self-Healing Supervisor — контроль инцидентов в среде покупателя с ремедиацией по одобрению человека',
    analyzeError: 'Не удалось проанализировать этот lead.', genericError: 'Что-то пошло не так. Попробуйте снова.',
    analyzing: 'Анализ…', analyzeButton: 'Анализировать и добавить lead', viewContacts: 'Посмотреть очередь контактов',
    leadQueued: 'Lead добавлен', newLead: 'Новый lead', draftFirstTouch: 'Черновик первого контакта',
    reviewContacts: 'Проверить в контактах', openEngine: 'Открыть движок',
    generateDeck: 'Создать презентацию', generatingDeck: 'Создание презентации…', deckError: 'Не удалось создать презентацию.',
    platforms: { manual: 'Вручную', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Сайт', directory: 'Каталог' },
    categories: { company: 'Компания', affiliate: 'Партнёр / Аффилиат', media: 'Медиаплатформа' },
  },
  de: {
    eyebrow: 'Erkundung', title: 'Finden Sie ein Unternehmen und lassen Sie die KI die Kontaktaufnahme vorbereiten.',
    subtitle: 'Fügen Sie eine öffentliche Website, ein Google-Profil oder eine Social-Media-Seite ein. SignalBoost analysiert das Unternehmen, prognostiziert seinen Bedarf und legt einen prüfbereiten Lead in Ihre Kontaktwarteschlange.',
    urlLabel: 'Unternehmens-URL oder -Profil *', nameLabel: 'Firmenname (optional)',
    sourceLabel: 'Quelle', categoryLabel: 'Outreach-Typ', notesLabel: 'Öffentlicher Text / Notizen (optional)',
    urlPlaceholder: 'https://example.com', namePlaceholder: 'z. B. Luna Travel',
    notesPlaceholder: 'Fügen Sie eine Kurzbiografie, Bewertungen oder alles ein, was beschreibt, was sie tun.',
    missingUrl: 'Fügen Sie eine Unternehmens-URL oder einen Profillink zur Analyse hinzu.',
    campaignLabel: 'Aktive Kampagne', campaignNone: 'Keine – SignalBoost-Plattformvorschau', campaignCustom: 'Benutzerdefiniert (unten eingeben)', campaignHint: 'Der Entwurf verwendet dieses Kampagnenbriefing – dasselbe, das auch der Hintergrund-Worker verwendet.',
    offerLabel: 'Was verkaufen Sie? (leer lassen für die SignalBoost-Plattformvorschau)', offerPlaceholder: 'z. B. Self-Healing Supervisor — vom Käufer gehostete Incident-Überwachung mit von Menschen genehmigter Behebung und signierten SIEM-Audit-Nachweisen',
    analyzeError: 'Dieser Lead konnte nicht analysiert werden.', genericError: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
    analyzing: 'Wird analysiert…', analyzeButton: 'Lead analysieren & einreihen', viewContacts: 'Kontaktwarteschlange anzeigen',
    leadQueued: 'Lead in Warteschlange', newLead: 'Neuer Lead', draftFirstTouch: 'Erstkontakt entwerfen',
    reviewContacts: 'In Kontakten prüfen', openEngine: 'Engine öffnen',
    generateDeck: 'Pitch-Deck erstellen', generatingDeck: 'Präsentation wird erstellt…', deckError: 'Die Präsentation konnte nicht erstellt werden.',
    platforms: { manual: 'Manuell', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Website', directory: 'Verzeichnis' },
    categories: { company: 'Unternehmen', affiliate: 'Affiliate / Partner', media: 'Medienplattform' },
  },
  fr: {
    eyebrow: 'Découverte', title: 'Trouvez une entreprise et laissez l’IA préparer la prise de contact.',
    subtitle: 'Collez un site web public, un profil Google ou une page de réseau social. SignalBoost analyse l’entreprise, anticipe ses besoins et dépose un prospect prêt à être examiné dans votre file de contacts.',
    urlLabel: 'URL ou profil de l\'entreprise *', nameLabel: 'Nom de l’entreprise (facultatif)',
    sourceLabel: 'Source', categoryLabel: 'Type de prospection', notesLabel: 'Texte public / notes (facultatif)',
    urlPlaceholder: 'https://example.com', namePlaceholder: 'ex. Luna Travel',
    notesPlaceholder: 'Collez une biographie, des avis ou tout ce qui décrit leur activité.',
    missingUrl: 'Ajoutez l’URL d’une entreprise ou un lien de profil à analyser.',
    campaignLabel: 'Campagne active', campaignNone: 'Aucune — aperçu de la plateforme SignalBoost', campaignCustom: 'Personnalisé (saisissez-le ci-dessous)', campaignHint: 'Le brouillon utilise ce brief de campagne, le même que celui du worker en arrière-plan.',
    offerLabel: 'Que vendez-vous ? (laissez vide pour l\'aperçu de la plateforme SignalBoost)', offerPlaceholder: 'p. ex. Self-Healing Supervisor — supervision des incidents hébergée par l’acheteur, avec remédiation approuvée par un humain et preuves d’audit SIEM signées',
    analyzeError: 'Impossible d’analyser ce prospect.', genericError: 'Une erreur s’est produite. Veuillez réessayer.',
    analyzing: 'Analyse en cours…', analyzeButton: 'Analyser et mettre le prospect en file', viewContacts: 'Voir la file des contacts',
    leadQueued: 'Prospect en file d’attente', newLead: 'Nouveau prospect', draftFirstTouch: 'Rédiger le premier contact',
    reviewContacts: 'Vérifier dans les contacts', openEngine: 'Ouvrir le moteur',
    generateDeck: 'Générer un pitch deck', generatingDeck: 'Création de la présentation…', deckError: 'Impossible de générer la présentation.',
    platforms: { manual: 'Manuel', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Site web', directory: 'Annuaire' },
    categories: { company: 'Entreprise', affiliate: 'Affilié / Partenaire', media: 'Plateforme média' },
  },
  it: {
    eyebrow: 'Scoperta', title: 'Trova un’azienda e lascia che l’AI prepari il contatto.',
    subtitle: 'Incolla un sito web pubblico, un profilo Google o una pagina social. SignalBoost analizza l’attività, prevede le sue esigenze e inserisce un lead pronto per la revisione nella tua coda contatti.',
    urlLabel: 'URL o profilo aziendale *', nameLabel: 'Nome dell’attività (facoltativo)',
    sourceLabel: 'Sorgente', categoryLabel: 'Tipo di outreach', notesLabel: 'Testo pubblico / note (facoltativo)',
    urlPlaceholder: 'https://example.com', namePlaceholder: 'es. Luna Travel',
    notesPlaceholder: 'Incolla una biografia, recensioni o qualsiasi cosa descriva ciò che fanno.',
    missingUrl: 'Aggiungi un URL aziendale o un link al profilo da analizzare.',
    campaignLabel: 'Campagna attiva', campaignNone: 'Nessuna — anteprima della piattaforma SignalBoost', campaignCustom: 'Personalizzato (scrivilo qui sotto)', campaignHint: 'La bozza usa questo brief di campagna, lo stesso usato dal worker in background.',
    offerLabel: 'Cosa vendi? (lascia vuoto per l\'anteprima della piattaforma SignalBoost)', offerPlaceholder: 'es. Self-Healing Supervisor — supervisione degli incidenti ospitata dall’acquirente con remediation approvata da persone ed evidenze di audit SIEM firmate',
    analyzeError: 'Impossibile analizzare questo lead.', genericError: 'Si è verificato un errore. Riprova.',
    analyzing: 'Analisi in corso…', analyzeButton: 'Analizza e metti in coda il lead', viewContacts: 'Visualizza coda contatti',
    leadQueued: 'Lead in coda', newLead: 'Nuovo lead', draftFirstTouch: 'Bozza del primo contatto',
    reviewContacts: 'Rivedi nei contatti', openEngine: 'Apri il motore',
    generateDeck: 'Genera pitch deck', generatingDeck: 'Creazione della presentazione…', deckError: 'Impossibile generare la presentazione.',
    platforms: { manual: 'Manuale', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'Sito web', directory: 'Directory' },
    categories: { company: 'Azienda', affiliate: 'Affiliato / Partner', media: 'Piattaforma media' },
  },
  ja: {
    eyebrow: 'ディスカバリー', title: '企業を探して、AIにアプローチの準備を任せましょう。',
    subtitle: '公開ウェブサイト、Google プロフィール、またはソーシャルページを貼り付けてください。SignalBoost がビジネスを分析してニーズを予測し、レビュー可能なリードを連絡先キューに追加します。',
    urlLabel: 'ビジネス URL またはプロフィール *', nameLabel: '会社名（任意）',
    sourceLabel: 'ソース', categoryLabel: 'アウトリーチの種類', notesLabel: '公開テキスト／メモ（任意）',
    urlPlaceholder: 'https://example.com', namePlaceholder: '例: Luna Travel',
    notesPlaceholder: '経歴、レビュー、または活動内容を説明するものを貼り付けてください。',
    missingUrl: '分析するビジネスの URL またはプロフィールリンクを追加してください。',
    campaignLabel: '有効なキャンペーン', campaignNone: 'なし — SignalBoost プラットフォームのプレビュー', campaignCustom: 'カスタム（下に入力）', campaignHint: '下書きはこのキャンペーンブリーフを使用します。バックグラウンドワーカーが使用するものと同じです。',
    offerLabel: '何を販売していますか？（SignalBoost プラットフォームのプレビューの場合は空欄のまま）', offerPlaceholder: '例：Self-Healing Supervisor — 購入者がホストするインシデント監視。人が承認する修復と署名付きSIEM監査証跡を備えています',
    analyzeError: 'このリードを分析できませんでした。', genericError: '問題が発生しました。もう一度お試しください。',
    analyzing: '分析中…', analyzeButton: 'リードを分析してキューに追加', viewContacts: '連絡先キューを表示',
    leadQueued: 'リードをキューに追加済み', newLead: '新規リード', draftFirstTouch: '最初の連絡を下書き',
    reviewContacts: '連絡先で確認', openEngine: 'エンジンを開く',
    generateDeck: 'ピッチデッキを生成', generatingDeck: 'デッキを作成中…', deckError: 'デッキを生成できませんでした。',
    platforms: { manual: '手動', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'ウェブサイト', directory: 'ディレクトリ' },
    categories: { company: '会社', affiliate: 'アフィリエイト / パートナー', media: 'メディアプラットフォーム' },
  },
  ko: {
    eyebrow: '탐색', title: '비즈니스를 찾고 AI가 아웃리치를 준비하도록 하세요.',
    subtitle: '공개 웹사이트, Google 프로필 또는 소셜 페이지를 붙여넣으세요. SignalBoost가 비즈니스를 분석하고 필요를 예측하여 검토 준비가 된 리드를 연락처 대기열에 추가합니다.',
    urlLabel: '비즈니스 URL 또는 프로필 *', nameLabel: '비즈니스 이름(선택 사항)',
    sourceLabel: '소스', categoryLabel: '아웃리치 유형', notesLabel: '공개 텍스트 / 메모(선택 사항)',
    urlPlaceholder: 'https://example.com', namePlaceholder: '예: Luna Travel',
    notesPlaceholder: '약력, 리뷰 또는 하는 일을 설명하는 내용을 붙여 넣으세요.',
    missingUrl: '분석할 비즈니스 URL 또는 프로필 링크를 추가하세요.',
    campaignLabel: '활성 캠페인', campaignNone: '없음 — SignalBoost 플랫폼 미리보기', campaignCustom: '사용자 지정(아래에 입력)', campaignHint: '초안은 이 캠페인 브리프를 사용하며, 백그라운드 워커가 사용하는 것과 동일합니다.',
    offerLabel: '무엇을 판매하시나요? (SignalBoost 플랫폼 미리보기는 비워 두세요)', offerPlaceholder: '예: Self-Healing Supervisor — 사람이 승인한 복구 조치와 서명된 SIEM 감사 증거를 갖춘, 구매자 호스팅 인시던트 감독',
    analyzeError: '이 리드를 분석할 수 없습니다.', genericError: '문제가 발생했습니다. 다시 시도하세요.',
    analyzing: '분석 중…', analyzeButton: '리드 분석 및 대기열 추가', viewContacts: '연락처 대기열 보기',
    leadQueued: '리드 대기열에 추가됨', newLead: '새 리드', draftFirstTouch: '첫 연락 초안 작성',
    reviewContacts: '연락처에서 검토', openEngine: '엔진 열기',
    generateDeck: '피치 덱 생성', generatingDeck: '프레젠테이션 만드는 중…', deckError: '프레젠테이션을 생성할 수 없습니다.',
    platforms: { manual: '수동', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: '웹사이트', directory: '디렉터리' },
    categories: { company: '회사', affiliate: '제휴사 / 파트너', media: '미디어 플랫폼' },
  },
  ar: {
    eyebrow: 'الاستكشاف', title: 'ابحث عن نشاط تجاري ودع الذكاء الاصطناعي يُعِدّ رسالة التواصل.',
    subtitle: 'الصق موقعًا إلكترونيًا عامًا أو ملفًا شخصيًا على Google أو صفحة على وسائل التواصل الاجتماعي. يحلّل SignalBoost النشاط التجاري ويتوقّع احتياجاته ويضع عميلًا محتملًا جاهزًا للمراجعة في قائمة انتظار جهات الاتصال لديك.',
    urlLabel: 'عنوان URL أو ملف النشاط التجاري *', nameLabel: 'اسم النشاط التجاري (اختياري)',
    sourceLabel: 'المصدر', categoryLabel: 'نوع التواصل', notesLabel: 'نص عام / ملاحظات (اختياري)',
    urlPlaceholder: 'https://example.com', namePlaceholder: 'مثال: Luna Travel',
    notesPlaceholder: 'الصق سيرة ذاتية أو مراجعات أو أي شيء يصف ما يفعلونه.',
    missingUrl: 'أضف URL لنشاط تجاري أو رابط ملف شخصي لتحليله.',
    campaignLabel: 'حملة نشطة', campaignNone: 'لا شيء — معاينة منصة SignalBoost', campaignCustom: 'مخصص (اكتبه أدناه)', campaignHint: 'تستخدم المسودة موجز الحملة هذا، وهو نفسه الذي يستخدمه العامل في الخلفية.',
    offerLabel: 'ماذا تبيع؟ (اتركه فارغًا لمعاينة منصة SignalBoost)', offerPlaceholder: 'مثال: Self-Healing Supervisor — إشراف على الحوادث يستضيفه المشتري مع معالجة يعتمدها البشر وأدلة تدقيق SIEM موقّعة',
    analyzeError: 'تعذّر تحليل هذا العميل المحتمل.', genericError: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
    analyzing: 'جارٍ التحليل…', analyzeButton: 'تحليل العميل المحتمل وإضافته إلى قائمة الانتظار', viewContacts: 'عرض قائمة جهات الاتصال',
    leadQueued: 'العميل المحتمل في قائمة الانتظار', newLead: 'عميل محتمل جديد', draftFirstTouch: 'صياغة أول تواصل',
    reviewContacts: 'المراجعة في جهات الاتصال', openEngine: 'فتح المحرك',
    generateDeck: 'إنشاء عرض تقديمي للمستثمرين', generatingDeck: 'جارٍ إنشاء العرض التقديمي…', deckError: 'تعذّر إنشاء العرض التقديمي.',
    platforms: { manual: 'يدوي', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram', wechat: 'WeChat', reddit: 'Reddit', website: 'الموقع الإلكتروني', directory: 'الدليل' },
    categories: { company: 'الشركة', affiliate: 'شريك تسويق بالعمولة / شريك', media: 'منصة الوسائط' },
  },
}

export default function OutreachDiscoveryPage() {
  const { lang } = useI18n()
  const copy = COPY[lang] || COPY.en

  const [businessUrl, setBusinessUrl]   = useState('')
  const [businessName, setBusinessName] = useState('')
  const [platform, setPlatform]         = useState('manual')
  const [category, setCategory]         = useState('company')
  const [publicText, setPublicText]     = useState('')
  const [offer, setOffer]               = useState('')
  type CampaignOption = { id: string; offer: string; target_criteria: string; region: string | null; language: string; status: string; drafts_created: number; requested_count: number }
  const [campaigns, setCampaigns]       = useState<CampaignOption[]>([])
  const [campaignId, setCampaignId]     = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [result, setResult]             = useState<any>(null)
  const [deckLoading, setDeckLoading]   = useState(false)
  const [deckError, setDeckError]       = useState('')

  // Pull the campaign briefs so this screen knows what is being sold right now,
  // instead of making the operator retype it for every lead.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/outreach/campaigns', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        const list: CampaignOption[] = Array.isArray(data?.campaigns) ? data.campaigns : []
        if (cancelled || !list.length) return
        setCampaigns(list)
        // Default to the most recent campaign: if one is running, that is almost always
        // what a manual lead belongs to.
        const newest = list[0]
        setCampaignId(newest.id)
        setOffer(newest.offer || '')
      } catch {
        // Campaign context is a convenience, never a blocker for manual analysis.
      }
    })()
    return () => { cancelled = true }
  }, [])

  function selectCampaign(id: string) {
    setCampaignId(id)
    if (!id) { setOffer(''); return }
    if (id === 'custom') return
    const found = campaigns.find(item => item.id === id)
    if (found) setOffer(found.offer || '')
  }

  async function analyze() {
    setError(''); setResult(null); setDeckError('')
    let url = businessUrl.trim()
    if (!url) { setError(copy.missingUrl); return }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    setLoading(true)
    try {
      const res = await fetch('/api/outreach/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_url: url, business_name: businessName.trim() || undefined, source_platform: platform, category, language: lang, public_text: publicText.trim() || undefined, offer: offer.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || copy.analyzeError); return }
      setResult(data.outreach)
    } catch { setError(copy.genericError) }
    finally { setLoading(false) }
  }

  async function generateDeck() {
    if (!result?.id) return
    setDeckError(''); setDeckLoading(true)
    try {
      const res = await fetch('/api/outreach/deck', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: result.id, category, language: lang }),
      })
      if (!res.ok) {
        let msg = copy.deckError
        try { const data = await res.json(); msg = data?.error || msg } catch {}
        setDeckError(msg); return
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const name = (result.business_name || result.analyzer_summary?.business_name || 'partner').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'partner'
      const a = document.createElement('a'); a.href = objectUrl; a.download = `signalboost-deck-${name}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(objectUrl)
    } catch { setDeckError(copy.deckError) }
    finally { setDeckLoading(false) }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 14, color: 'var(--text-primary)' }}>

      {/* Header — compact studio bar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p className="sb-eyebrow" style={{ margin: 0 }}>🔍 {copy.eyebrow}</p>
          <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.15, margin: '4px 0 0' }}>{copy.title}</h1>
        </div>
        <Link className="sb-button-secondary" href="/dashboard/outreach/contacts" style={{ fontSize: 13, padding: '9px 15px', whiteSpace: 'nowrap' }}>{copy.viewContacts}</Link>
      </div>

      {/* Form — flat */}
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-url">{copy.urlLabel}</label>
          <input id="biz-url" className="sb-input" value={businessUrl} onChange={e => setBusinessUrl(e.target.value)} placeholder={copy.urlPlaceholder} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-name">{copy.nameLabel}</label>
            <input id="biz-name" className="sb-input" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder={copy.namePlaceholder} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-platform">{copy.sourceLabel}</label>
            <select id="biz-platform" className="sb-input" value={platform} onChange={e => setPlatform(e.target.value)} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }}>
              {PLATFORMS.map(item => <option key={item} value={item}>{copy.platforms[item] || item}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-category">{copy.categoryLabel}</label>
            <select id="biz-category" className="sb-input" value={category} onChange={e => setCategory(e.target.value)} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }}>
              {CATEGORIES.map(item => <option key={item} value={item}>{copy.categories[item] || item}</option>)}
            </select>
          </div>
        </div>
        {campaigns.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-campaign">{copy.campaignLabel}</label>
            <select id="biz-campaign" className="sb-input" value={campaignId} onChange={e => selectCampaign(e.target.value)} style={{ padding: '11px 14px', borderRadius: 12, fontSize: 14 }}>
              {campaigns.map(item => (
                <option key={item.id} value={item.id}>
                  {`${item.region || '—'} · ${item.language} · ${item.drafts_created}/${item.requested_count} · ${item.offer.slice(0, 60)}`}
                </option>
              ))}
              <option value="custom">{copy.campaignCustom}</option>
              <option value="">{copy.campaignNone}</option>
            </select>
            <span className="sb-caption" style={{ fontSize: 11, opacity: 0.75 }}>{copy.campaignHint}</span>
          </div>
        ) : null}
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-offer">{copy.offerLabel}</label>
          <textarea id="biz-offer" className="sb-input" value={offer} onChange={e => setOffer(e.target.value)} rows={3} placeholder={copy.offerPlaceholder} style={{ padding: '11px 14px', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.6 }} />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="sb-eyebrow" style={{ fontSize: 10 }} htmlFor="biz-text">{copy.notesLabel}</label>
          <textarea id="biz-text" className="sb-input" value={publicText} onChange={e => setPublicText(e.target.value)} rows={2} placeholder={copy.notesPlaceholder} style={{ padding: '11px 14px', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.6 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="sb-button-primary" type="button" onClick={analyze} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
            {loading ? copy.analyzing : copy.analyzeButton}
          </button>
        </div>
        {error && <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>{error}</p>}
      </div>

      {/* Result */}
      {result && (
        <div style={{ borderTop: '1px solid rgba(74,222,128,.35)', borderLeft: '2px solid rgba(74,222,128,.5)', paddingTop: 16, paddingLeft: 14 }}>
          <p className="sb-eyebrow" style={{ color: '#86efac' }}>✓ {copy.leadQueued}</p>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', margin: '8px 0 14px' }}>
            {result.business_name || result.analyzer_summary?.business_name || copy.newLead}
          </h2>
          {result.outreach_message && (
            <div style={{ borderLeft: '2px solid rgba(255,195,0,.55)', paddingLeft: 14, marginBottom: 14 }}>
              <strong style={{ color: '#ffc300', fontSize: 13 }}>{copy.draftFirstTouch}</strong>
              <p style={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 8 }}>{result.outreach_message}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="sb-button-primary" href="/dashboard/outreach/contacts">{copy.reviewContacts}</Link>
            <button className="sb-button-secondary" type="button" onClick={generateDeck} disabled={deckLoading} style={{ opacity: deckLoading ? 0.7 : 1 }}>
              {deckLoading ? copy.generatingDeck : copy.generateDeck}
            </button>
            <Link className="sb-button-secondary" href="/dashboard/outreach/outreach">{copy.openEngine}</Link>
          </div>
          {deckError && <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 10 }}>{deckError}</p>}
        </div>
      )}
    </div>
  )
}
