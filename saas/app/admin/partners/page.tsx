'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

function getLang(): Lang {
  if (typeof window !== 'undefined') { const s = localStorage.getItem('signalboost_language'); if (s && (s in COPY)) return s as any }
  if (typeof navigator === 'undefined') return 'en'
  const l = navigator.language.slice(0, 2)
  if (l === 'es') return 'es'
  if (l === 'pt') return 'pt'
  if (l === 'pl') return 'pl'
  if (l === 'ru') return 'ru'
  if (l === 'de') return 'de'
  if (l === 'fr') return 'fr'
  if (l === 'it') return 'it'
  if (l === 'ja') return 'ja'
  if (l === 'ko') return 'ko'
  if (l === 'ar') return 'ar'
  return 'en'
}

const COPY = {
  en: {
    eyebrow: uiText('generatedUi.u_5dab502bfba3c3df'),
    heading: uiText('generatedUi.u_6d748622bf7ba1e9'),
    intro: uiText('generatedUi.u_5d902f6e8ec0bcf5'),
    reviewBtn: uiText('generatedUi.u_9728ba1815917851'),
    perfTitle: uiText('generatedUi.u_9126ee498b8cde5a'),
    perfCaption: uiText('generatedUi.u_129c4e7592bb5124'),
    addBtn: uiText('generatedUi.u_6aea65df8df4ba16'),
    colIntent: uiText('generatedUi.u_29131ad07db3d306'),
    colPartner: uiText('generatedUi.u_29035e784f9305c0'),
    colClicks: uiText('generatedUi.u_921fc9804ed31b1a'),
    colStatus: uiText('generatedUi.u_920e413c7d411b61'),
    empty: uiText('generatedUi.u_c27bfe1094984053'),
    intents: [
      [uiText('generatedUi.u_f8f5aa2b57ba8689'), uiText('generatedUi.u_15f52bfc9eec0091'), uiText('generatedUi.u_401d9ae5641988a1')],
      [uiText('generatedUi.u_9fb889ca7b718a04'), uiText('generatedUi.u_e082829f1348e8c8'), uiText('generatedUi.u_d10c1fbfc37a4c86')],
      [uiText('generatedUi.u_f9dd1d5083748c36'), uiText('generatedUi.u_e38b4a7affd6ac4f'), uiText('generatedUi.u_fdbed438a1d5ba9f')],
      [uiText('generatedUi.u_4594b737568af7e3'), uiText('generatedUi.u_f4675fac405d01f2'), uiText('generatedUi.u_c628815bba733c90')],
      [uiText('generatedUi.u_4d0076e6b4c71059'), uiText('generatedUi.u_a207571fade7677d'), uiText('generatedUi.u_3ceb462567d0e0a3')],
    ],
  },
  es: {
    eyebrow: 'Socios',
    heading: 'Organizado según lo que el viajero necesita a continuación.',
    intro: 'En lugar de una lista plana de socios, esta consola agrupa la oferta por intención humana: llegar, alojarse, conectarse, sentirse protegido y vivir algo memorable.',
    reviewBtn: 'Ver socios',
    perfTitle: 'Rendimiento de socios por intención',
    perfCaption: 'Filtros: rango de fechas • país • intención del usuario • categoría de socio',
    addBtn: 'Agregar socio',
    colIntent: 'Intención',
    colPartner: 'Socio',
    colClicks: 'Clics',
    colStatus: 'Estado',
    empty: 'Aún no hay clics de socios registrados — conecta el análisis de clics de socios para poblar esta vista.',
    intents: [
      ['Vuelos', 'Ayuda a los viajeros a llegar primero.', 'Compara ofertas de vuelos, aerolíneas regionales y promociones de viaje urgentes.'],
      ['Hoteles', 'Dales un lugar seguro donde aterrizar.', 'Muestra socios de alojamiento por presupuesto, ubicación, flexibilidad de cancelación y confianza.'],
      ['SIM Cards', 'Mantén a los clientes conectados al llegar.', 'Prioriza socios eSIM/SIM con adecuación al país, claridad de configuración y calidad de soporte.'],
      ['Seguros', 'Reduce la ansiedad del viaje.', 'Agrupa protección médica, de viaje y de equipaje en torno a la confianza y el cumplimiento.'],
      ['Actividades', 'Convierte la llegada en una experiencia.', 'Recomienda tours, eventos, gastronomía y experiencias locales por intención y región.'],
    ],
  },
  pt: {
    eyebrow: 'Parceiros',
    heading: 'Organizado pelo que o viajante precisa a seguir.',
    intro: 'Em vez de uma lista plana de parceiros, este console agrupa a oferta por intenção humana: chegar lá, ficar lá, conectar-se, sentir-se protegido e fazer algo memorável.',
    reviewBtn: 'Ver parceiros',
    perfTitle: 'Desempenho de parceiros por intenção',
    perfCaption: 'Filtros: intervalo de datas • país • intenção do usuário • categoria de parceiro',
    addBtn: 'Adicionar parceiro',
    colIntent: 'Intenção',
    colPartner: 'Parceiro',
    colClicks: 'Cliques',
    colStatus: 'Status',
    empty: 'Ainda não há cliques de parceiros registrados — conecte a análise de cliques de parceiros para preencher esta visualização.',
    intents: [
      ['Voos', 'Ajude os viajantes a chegar primeiro.', 'Compare ofertas de voos, companhias regionais e promoções de viagem urgentes.'],
      ['Hotéis', 'Dê a eles um lugar seguro para pousar.', 'Mostre parceiros de hospedagem por orçamento, localização, flexibilidade de cancelamento e confiança.'],
      ['SIM Cards', 'Mantenha os clientes conectados ao chegar.', 'Priorize parceiros eSIM/SIM com adequação ao país, clareza de configuração e qualidade de suporte.'],
      ['Seguros', 'Reduza a ansiedade de viagem.', 'Agrupe proteção médica, de viagem e de equipamentos em torno de confiança e conformidade.'],
      ['Atividades', 'Transforme a chegada em uma experiência.', 'Recomende passeios, eventos, gastronomia e experiências locais por intenção e região.'],
    ],
  },
  pl: {
    eyebrow: 'Partnerzy',
    heading: 'Zorganizowane według tego, czego podróżnik potrzebuje dalej.',
    intro: 'Zamiast jednej płaskiej listy partnerów, ta konsola grupuje ofertę według ludzkiej intencji: dotrzeć tam, zostać, połączyć się, poczuć się bezpiecznie i przeżyć coś niezapomnianego.',
    reviewBtn: 'Przejrzyj partnerów',
    perfTitle: 'Wyniki partnerów według intencji',
    perfCaption: 'Filtry: zakres dat • kraj • intencja użytkownika • kategoria partnera',
    addBtn: 'Dodaj partnera',
    colIntent: 'Intencja',
    colPartner: 'Partner',
    colClicks: 'Kliknięcia',
    colStatus: 'Status',
    empty: 'Brak zarejestrowanych kliknięć partnerów — podłącz analitykę kliknięć partnerów, aby wypełnić ten widok.',
    intents: [
      ['Loty', 'Pomóż podróżnikom dotrzeć na miejsce jako pierwsi.', 'Porównaj oferty lotów, regionalnych przewoźników i pilne promocje podróżne.'],
      ['Hotele', 'Daj im bezpieczne miejsce do lądowania.', 'Pokaż partnerów noclegowych według budżetu, lokalizacji, elastyczności anulowania i zaufania.'],
      ['Karty SIM', 'Utrzymaj klientów w kontakcie po przylocie.', 'Priorytetyzuj partnerów eSIM/SIM pod kątem dopasowania do kraju, jasności konfiguracji i jakości wsparcia.'],
      ['Ubezpieczenia', 'Zmniejsz lęk przed podróżą.', 'Grupuj ochronę medyczną, podróżną i sprzętową wokół pewności i zgodności.'],
      ['Aktywności', 'Zamień przybycie w doświadczenie.', 'Polecaj wycieczki, wydarzenia, restauracje i lokalne doświadczenia według intencji i regionu.'],
    ],
  },
  ru: {
    eyebrow: 'Партнёры',
    heading: 'Организовано по тому, что нужно путешественнику дальше.',
    intro: 'Вместо единого плоского списка партнёров эта консоль группирует предложения по человеческому намерению: добраться туда, остановиться, оставаться на связи, чувствовать себя защищённым и получить незабываемые впечатления.',
    reviewBtn: 'Просмотр партнёров',
    perfTitle: 'Эффективность партнёров по намерению',
    perfCaption: 'Фильтры: диапазон дат • страна • намерение пользователя • категория партнёра',
    addBtn: 'Добавить партнёра',
    colIntent: 'Намерение',
    colPartner: 'Партнёр',
    colClicks: 'Клики',
    colStatus: 'Статус',
    empty: 'Кликов партнёров пока нет — подключите аналитику кликов партнёров, чтобы заполнить этот вид.',
    intents: [
      ['Авиабилеты', 'Помогите путешественникам добраться первыми.', 'Сравнивайте предложения авиабилетов, региональных перевозчиков и срочные туристические акции.'],
      ['Отели', 'Дайте им безопасное место для посадки.', 'Показывайте партнёров по размещению по бюджету, местоположению, гибкости отмены и доверию.'],
      ['SIM-карты', 'Держите клиентов на связи по прибытии.', 'Приоритизируйте партнёров eSIM/SIM по соответствию стране, ясности настройки и качеству поддержки.'],
      ['Страхование', 'Снизьте тревогу от путешествий.', 'Группируйте медицинскую, туристическую и имущественную защиту вокруг уверенности и соответствия.'],
      ['Активности', 'Превратите прибытие в впечатление.', 'Рекомендуйте туры, мероприятия, рестораны и местные впечатления по намерению и региону.'],
    ],
  },
  de: {
    eyebrow: 'Partner',
    heading: 'Geordnet danach, was der Reisende als Nächstes braucht.',
    intro: 'Statt einer flachen Partnerliste gruppiert diese Konsole das Angebot nach menschlicher Absicht: hinkommen, dort bleiben, sich verbinden, sich geschützt fühlen und etwas Unvergessliches erleben.',
    reviewBtn: 'Partner prüfen',
    perfTitle: 'Partnerleistung nach Absicht',
    perfCaption: 'Filter: Zeitraum • Land • Nutzerabsicht • Partnerkategorie',
    addBtn: 'Partner hinzufügen',
    colIntent: 'Absicht',
    colPartner: 'Partner',
    colClicks: 'Klicks',
    colStatus: 'Status',
    empty: 'Noch keine Partnerklicks erfasst — verbinden Sie die Partnerklick-Analyse, um diese geordnete Ansicht zu füllen.',
    intents: [
      ['Flüge', 'Helfen Sie Reisenden, als Erste anzukommen.', 'Vergleichen Sie Flugangebote, regionale Fluggesellschaften und dringlichkeitsbasierte Reiseaktionen.'],
      ['Hotels', 'Bieten Sie ihnen einen sicheren Ort zum Ankommen.', 'Zeigen Sie Unterkunftspartner nach Budget, Lage, Stornierungsflexibilität und Vertrauenswürdigkeit an.'],
      ['SIM-Karten', 'Halten Sie Kunden bei ihrer Ankunft verbunden.', 'Priorisieren Sie eSIM-/SIM-Partner nach Länderpassung, klarer Einrichtung und Supportqualität.'],
      ['Versicherung', 'Reiseangst verringern.', 'Gruppen-Kranken-, Reise- und Ausrüstungsschutz rund um Vertrauen und Compliance.'],
      ['Aktivitäten', 'Machen Sie die Ankunft zum Erlebnis.', 'Empfehlen Sie Touren, Veranstaltungen, Gastronomie und lokale Erlebnisse nach Absicht und Region.'],
    ],
  },
  fr: {
    eyebrow: 'Partenaires',
    heading: 'Organisé selon ce dont le voyageur a besoin ensuite.',
    intro: 'Au lieu d’une simple liste de partenaires, cette console regroupe l’offre selon l’intention humaine : s’y rendre, y séjourner, se connecter, se sentir protégé et vivre quelque chose de mémorable.',
    reviewBtn: 'Examiner les partenaires',
    perfTitle: 'Performance des partenaires par intention',
    perfCaption: 'Filtres : période • pays • intention de l\'utilisateur • catégorie de partenaire',
    addBtn: 'Ajouter un partenaire',
    colIntent: 'Intention',
    colPartner: 'Partenaire',
    colClicks: 'Clics',
    colStatus: 'Statut',
    empty: 'Aucun clic partenaire enregistré pour le moment — connectez l’analyse des clics partenaires pour alimenter cette vue organisée.',
    intents: [
      ['Vols', 'Aidez les voyageurs à arriver les premiers.', 'Comparez les offres de vols, les compagnies régionales et les promotions de voyage de dernière minute.'],
      ['Hôtels', 'Offrez-leur un endroit sûr où atterrir.', 'Faites ressortir des partenaires d’hébergement selon le budget, l’emplacement, la flexibilité d’annulation et la fiabilité.'],
      ['Cartes SIM', 'Gardez vos clients connectés dès leur arrivée.', 'Privilégiez les partenaires eSIM/SIM selon l’adéquation au pays, la clarté de la configuration et la qualité du support.'],
      ['Assurance', 'Réduire l\'anxiété liée aux voyages.', 'Protection médicale, voyage et équipement pour les groupes, axée sur la confiance et la conformité.'],
      ['Activités', 'Faites de l’arrivée une expérience.', 'Recommandez des visites, des événements, des restaurants et des expériences locales selon l’intention et la région.'],
    ],
  },
  it: {
    eyebrow: 'Partner',
    heading: 'Organizzato in base a ciò di cui il viaggiatore ha bisogno dopo.',
    intro: 'Invece di un semplice elenco di partner, questa console raggruppa l’offerta in base all’intenzione umana: arrivarci, soggiornare, connettersi, sentirsi protetti e vivere qualcosa di memorabile.',
    reviewBtn: 'Rivedi i partner',
    perfTitle: 'Prestazioni dei partner per intento',
    perfCaption: 'Filtri: intervallo di date • paese • intento dell\'utente • categoria partner',
    addBtn: 'Aggiungi partner',
    colIntent: 'Intento',
    colPartner: 'Partner',
    colClicks: 'Clic',
    colStatus: 'Stato',
    empty: 'Nessun clic dei partner registrato finora — collega l’analisi dei clic dei partner per popolare questa vista organizzata.',
    intents: [
      ['Voli', 'Aiuta i viaggiatori ad arrivare per primi.', 'Confronta offerte di voli, compagnie regionali e promozioni di viaggio basate sull’urgenza.'],
      ['Hotel', 'Offri loro un posto sicuro in cui approdare.', 'Mostra i partner di alloggio in base a budget, posizione, flessibilità di cancellazione e affidabilità.'],
      ['Schede SIM', 'Mantieni i clienti connessi al loro arrivo.', 'Dai priorità ai partner eSIM/SIM in base all’idoneità per paese, alla chiarezza della configurazione e alla qualità del supporto.'],
      ['Assicurazioni', 'Ridurre l\'ansia da viaggio.', 'Protezione sanitaria, di viaggio e dell’attrezzatura per gruppi, incentrata su fiducia e conformità.'],
      ['Attività', 'Trasforma l’arrivo in un’esperienza.', 'Consiglia tour, eventi, ristoranti ed esperienze locali in base all’intento e alla regione.'],
    ],
  },
  ja: {
    eyebrow: 'パートナー',
    heading: '旅行者が次に必要とするものに沿って整理されています。',
    intro: 'このコンソールは、パートナーを単純に一覧表示するのではなく、人の目的別に供給をグループ化します：到着する、滞在する、つながる、安心する、そして思い出に残る体験をする。',
    reviewBtn: 'パートナーを確認',
    perfTitle: 'インテント別パートナー実績',
    perfCaption: 'フィルター: 期間 • 国 • ユーザーの意図 • パートナーカテゴリ',
    addBtn: 'パートナーを追加',
    colIntent: '意図',
    colPartner: 'パートナー',
    colClicks: 'クリック数',
    colStatus: 'ステータス',
    empty: 'パートナーのクリックはまだ記録されていません — パートナークリック分析を接続すると、この整理されたビューにデータが表示されます。',
    intents: [
      ['フライト', '旅行者がいち早く到着できるようサポートします。', '航空券のオファー、地域航空会社、緊急度に応じた旅行プロモーションを比較します。'],
      ['ホテル', '安心して訪れられる場所を用意しましょう。', '予算、立地、キャンセルの柔軟性、信頼性に基づいて宿泊パートナーを表示します。'],
      ['SIM カード', '到着時からお客様をつなぎ続けましょう。', '国への適合性、セットアップのわかりやすさ、サポート品質を基準にeSIM/SIMパートナーを優先してください。'],
      ['保険', '旅行の不安を軽減します。', '信頼とコンプライアンスを軸にした、団体向けの医療・旅行・装備の保障。'],
      ['アクティビティ', '到着を特別な体験に。', '目的と地域に応じて、ツアー、イベント、飲食、地域体験をおすすめします。'],
    ],
  },
  ko: {
    eyebrow: '파트너',
    heading: '여행자가 다음에 필요로 하는 것을 기준으로 정리되어 있습니다.',
    intro: '이 콘솔은 단순한 파트너 목록 대신 사람의 의도에 따라 공급을 그룹화합니다: 도착하기, 머무르기, 연결하기, 보호받는다고 느끼기, 기억에 남는 일 하기.',
    reviewBtn: '파트너 검토',
    perfTitle: '의도별 파트너 성과',
    perfCaption: '필터: 기간 • 국가 • 사용자 의도 • 파트너 카테고리',
    addBtn: '파트너 추가',
    colIntent: '의도',
    colPartner: '파트너',
    colClicks: '클릭 수',
    colStatus: '상태',
    empty: '아직 기록된 파트너 클릭이 없습니다 — 파트너 클릭 분석을 연결하여 이 정리된 보기를 채우세요.',
    intents: [
      ['항공편', '여행자가 먼저 도착할 수 있도록 도와주세요.', '항공권 제안, 지역 항공사 및 긴급도 기반 여행 프로모션을 비교하세요.'],
      ['호텔', '안심하고 찾아올 수 있는 곳을 마련하세요.', '예산, 위치, 취소 유연성, 신뢰도를 기준으로 숙박 파트너를 표시합니다.'],
      ['SIM 카드', '도착하는 순간부터 고객과 연결을 유지하세요.', '국가 적합성, 설정 명확성, 지원 품질을 기준으로 eSIM/SIM 파트너를 우선 선정하세요.'],
      ['보험', '여행 불안을 줄이세요.', '신뢰와 컴플라이언스를 중심으로 한 단체 의료, 여행, 장비 보호.'],
      ['활동', '도착을 경험으로 바꾸세요.', '의도와 지역에 따라 투어, 이벤트, 식사 및 현지 체험을 추천하세요.'],
    ],
  },
  ar: {
    eyebrow: 'الشركاء',
    heading: 'منظّم حسب ما يحتاجه المسافر بعد ذلك.',
    intro: 'بدلاً من قائمة شركاء مسطحة، تجمع وحدة التحكم هذه العروض حسب النية البشرية: الوصول، والإقامة، والتواصل، والشعور بالحماية، والقيام بشيء لا يُنسى.',
    reviewBtn: 'مراجعة الشركاء',
    perfTitle: 'أداء الشركاء حسب النية',
    perfCaption: 'عوامل التصفية: النطاق الزمني • البلد • نية المستخدم • فئة الشريك',
    addBtn: 'إضافة شريك',
    colIntent: 'النية',
    colPartner: 'شريك',
    colClicks: 'النقرات',
    colStatus: 'الحالة',
    empty: 'لم تُسجَّل أي نقرات للشركاء بعد — اربط تحليلات نقرات الشركاء لتعبئة هذا العرض المنظّم.',
    intents: [
      ['الرحلات الجوية', 'ساعد المسافرين على الوصول أولاً.', 'قارن عروض الرحلات الجوية وشركات الطيران الإقليمية وعروض السفر القائمة على الإلحاح.'],
      ['الفنادق', 'امنحهم مكانًا آمنًا يصلون إليه.', 'اعرض شركاء الإقامة حسب الميزانية والموقع ومرونة الإلغاء والموثوقية.'],
      ['بطاقات SIM', 'حافظ على تواصل العملاء عند وصولهم.', 'أعطِ الأولوية لشركاء eSIM/SIM وفقًا لملاءمتهم للبلد ووضوح الإعداد وجودة الدعم.'],
      ['التأمين', 'تقليل القلق من السفر.', 'حماية جماعية طبية وللرحلات وللمعدات تتمحور حول الثقة والامتثال.'],
      ['الأنشطة', 'حوّل لحظة الوصول إلى تجربة.', 'اقترح الجولات والفعاليات والمطاعم والتجارب المحلية حسب النية والمنطقة.'],
    ],
  },
}

type PartnerRow = { intent: string; partner: string; clicks: number | null; status: string }

// Localized labels for the known status values the API emits. Unknown values
// pass through unchanged so a new backend status never renders as a blank.
const STATUS_COPY: Record<Lang, Record<string, string>> = {
  en: { Active: uiText('generatedUi.u_92340695899bd2d8'), Paused: uiText('generatedUi.u_e159b06187d369a0'), Pending: uiText('generatedUi.u_331551b0de4157c9') },
  es: { Active: 'Activo', Paused: 'En pausa', Pending: 'Pendiente' },
  pt: { Active: 'Ativo', Paused: 'Pausado', Pending: 'Pendente' },
  pl: { Active: 'Aktywny', Paused: 'Wstrzymany', Pending: 'Oczekujący' },
  ru: { Active: 'Активен', Paused: 'Приостановлен', Pending: 'Ожидание' },
  de: { Active: 'Aktiv', Paused: 'Pausiert', Pending: 'Ausstehend' },
  fr: { Active: 'Actif', Paused: 'En pause', Pending: 'En attente' },
  it: { Active: 'Attivo', Paused: 'In pausa', Pending: 'In sospeso' },
  ja: { Active: '有効', Paused: '一時停止中', Pending: '保留中' },
  ko: { Active: '활성', Paused: '일시 중지됨', Pending: '대기 중' },
  ar: { Active: 'نشط', Paused: 'متوقف مؤقتًا', Pending: 'قيد الانتظار' },
}

function statusLabel(status: string, lang: Lang): string {
  return STATUS_COPY[lang]?.[status] ?? STATUS_COPY.en[status] ?? status
}

export default function PartnersPage() {
  const { lang: activeLang } = useI18n()
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    setLang(getLang())
  }, [])

  const c = COPY[(activeLang in COPY ? activeLang : 'en') as keyof typeof COPY]
  const tableLang: Lang = (activeLang in COPY ? activeLang : 'en') as Lang

  // Live partner-performance feed (marketing Supabase `affiliate_partners`).
  // On no-config / error / empty, `rows` stays empty and the honest localized
  // empty-state is shown — never a fabricated row.
  const [rows, setRows] = useState<PartnerRow[]>([])
  useEffect(() => {
    let active = true
    fetch('/api/admin/partner-performance', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active && d && d.ok && Array.isArray(d.rows)) setRows(d.rows) })
      .catch(() => {})
    return () => { active = false }
  }, [])


  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Hero */}
      <section style={{
        background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: '16px',
        padding: '24px',
      }}>
        <span className="sb-eyebrow">{c.eyebrow}</span>
        <h1 className="sb-h2" style={{ marginTop: '12px' }}>{c.heading}</h1>
        <p className="sb-body" style={{ maxWidth: '720px' }}>{c.intro}</p>
      </section>

      {/* Intent cards */}
      <section style={{
        display: 'grid',
        gap: '16px',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      }}>
        {c.intents.map(([title, prompt, detail]) => (
          <article key={title} style={{
            background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <span className="sb-eyebrow">{title}</span>
            <h2 className="sb-h3" style={{ marginTop: '4px' }}>{prompt}</h2>
            <p className="sb-body" style={{ fontSize: '13px', flex: 1 }}>{detail}</p>
          </article>
        ))}
      </section>

      {/* Performance table */}
      <section style={{
        background: 'linear-gradient(160deg, rgba(15,23,42,.92), rgba(3,7,18,.96))',
        border: '1px solid rgba(255,255,255,.1)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,.1)',
          padding: '20px',
        }}>
          <div>
            <h2 className="sb-h3">{c.perfTitle}</h2>
            <p className="sb-caption">{c.perfCaption}</p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'start', fontSize: '14px', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.6)' }}>
              <tr>
                <th style={{ padding: '12px 20px' }}>{c.colIntent}</th>
                <th style={{ padding: '12px 20px' }}>{c.colPartner}</th>
                <th style={{ padding: '12px 20px' }}>{c.colClicks}</th>
                <th style={{ padding: '12px 20px' }}>{c.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
                  <td style={{ padding: '24px 20px', color: 'rgba(255,255,255,.4)' }} colSpan={4}>
                    {c.empty}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={`${row.partner}-${i}`} style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
                    <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,.7)' }}>{row.intent}</td>
                    <td style={{ padding: '12px 20px', color: '#fff', fontWeight: 600 }}>{row.partner}</td>
                    <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,.7)' }}>{row.clicks == null ? '—' : row.clicks.toLocaleString()}</td>
                    <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,.7)' }}>{statusLabel(row.status, tableLang)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
