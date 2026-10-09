// saas/lib/i18n/auditPricingCopy.ts
// Audit/security pricing page copy — four commercial tiers, all 5 locales,
// self-contained. Reusable labels are localized; tier proper-names
// (Starter/Growth/Pro/Enterprise) are kept in English across locales by design.
//
// Tier positioning (commercial packaging):
//   Growth  ($79)  — static code auditing + UX integrity. No patch gen, no cyber.
//   Pro     ($199) — everything in Growth + AI-assisted Git patch generation.
//   Ent.    ($599) — everything in Pro + the live cybersecurity suite
//                    (vulnerability mapping, continuous threat assessment,
//                     dependency exploit tracking).

import { AUDIT_PRICING_CONFIG, formatCredits } from '@/lib/audit/pricingConfig'

type FlatCopy = Record<string, string>

export const AUDIT_PRICING_COPY: Record<string, FlatCopy> = {
  en: {
    'auditPricing.kicker': 'Audit',
    'auditPricing.title': 'Audit Pricing',
    'auditPricing.subtitle': 'Deep security scans powered by advanced AI. Choose the plan that fits your team.',
    'auditPricing.perMonth': '/ mo',
    'auditPricing.popular': 'Most Popular',
    'auditPricing.cta.paid': 'Upgrade Now',
    'auditPricing.upgradeNotice': 'Upgrade is processed through Stripe. Pricing is not configured yet — check back soon.',
    'auditPricing.feat.audits': 'Audits / month',
    'auditPricing.feat.auditsUnlimited': 'Unlimited',
    'auditPricing.feat.maxFiles': 'Max files per run',
    'auditPricing.feat.history': 'Run history',
    'auditPricing.feat.historyDays': '{n} days',
    'auditPricing.feat.patch': 'AI patch generation',
    'auditPricing.feat.seats': 'Team seats',
    'auditPricing.feat.seatsUnlimited': 'Unlimited',
    'auditPricing.feat.support': 'Support',
    'auditPricing.support.email': 'Email',
    'auditPricing.support.priority': 'Priority',
    'auditPricing.support.dedicated': 'Dedicated',
  },
  es: {
    'auditPricing.kicker': 'Auditoría',
    'auditPricing.title': 'Precios de Auditoría',
    'auditPricing.subtitle': 'Análisis de seguridad profundos con IA avanzada. Elige el plan que se adapta a tu equipo.',
    'auditPricing.perMonth': '/ mes',
    'auditPricing.popular': 'Más Popular',
    'auditPricing.cta.paid': 'Actualizar Ahora',
    'auditPricing.upgradeNotice': 'La actualización se procesa con Stripe. Los precios aún no están configurados — vuelve pronto.',
    'auditPricing.feat.audits': 'Auditorías / mes',
    'auditPricing.feat.auditsUnlimited': 'Ilimitadas',
    'auditPricing.feat.maxFiles': 'Máx. archivos por ejecución',
    'auditPricing.feat.history': 'Historial de ejecuciones',
    'auditPricing.feat.historyDays': '{n} días',
    'auditPricing.feat.patch': 'Generación de parches con IA',
    'auditPricing.feat.seats': 'Puestos del equipo',
    'auditPricing.feat.seatsUnlimited': 'Ilimitados',
    'auditPricing.feat.support': 'Soporte',
    'auditPricing.support.email': 'Correo electrónico',
    'auditPricing.support.priority': 'Prioritario',
    'auditPricing.support.dedicated': 'Dedicado',
  },
  pt: {
    'auditPricing.kicker': 'Auditoria',
    'auditPricing.title': 'Preços de Auditoria',
    'auditPricing.subtitle': 'Análises de segurança profundas com IA avançada. Escolha o plano que se encaixa na sua equipe.',
    'auditPricing.perMonth': '/ mês',
    'auditPricing.popular': 'Mais Popular',
    'auditPricing.cta.paid': 'Atualizar Agora',
    'auditPricing.upgradeNotice': 'A atualização é processada pelo Stripe. Os preços ainda não estão configurados — volte em breve.',
    'auditPricing.feat.audits': 'Auditorias / mês',
    'auditPricing.feat.auditsUnlimited': 'Ilimitadas',
    'auditPricing.feat.maxFiles': 'Máx. arquivos por execução',
    'auditPricing.feat.history': 'Histórico de execuções',
    'auditPricing.feat.historyDays': '{n} dias',
    'auditPricing.feat.patch': 'Geração de correções com IA',
    'auditPricing.feat.seats': 'Assentos da equipe',
    'auditPricing.feat.seatsUnlimited': 'Ilimitados',
    'auditPricing.feat.support': 'Suporte',
    'auditPricing.support.email': 'E-mail',
    'auditPricing.support.priority': 'Prioritário',
    'auditPricing.support.dedicated': 'Dedicado',
  },
  pl: {
    'auditPricing.kicker': 'Audyt',
    'auditPricing.title': 'Cennik Audytu',
    'auditPricing.subtitle': 'Dogłębne skany bezpieczeństwa z zaawansowaną AI. Wybierz plan dopasowany do Twojego zespołu.',
    'auditPricing.perMonth': '/ mies.',
    'auditPricing.popular': 'Najpopularniejszy',
    'auditPricing.cta.paid': 'Ulepsz teraz',
    'auditPricing.upgradeNotice': 'Ulepszenie jest przetwarzane przez Stripe. Ceny nie są jeszcze skonfigurowane — sprawdź wkrótce.',
    'auditPricing.feat.audits': 'Audyty / miesiąc',
    'auditPricing.feat.auditsUnlimited': 'Nieograniczone',
    'auditPricing.feat.maxFiles': 'Maks. plików na uruchomienie',
    'auditPricing.feat.history': 'Historia uruchomień',
    'auditPricing.feat.historyDays': '{n} dni',
    'auditPricing.feat.patch': 'Generowanie poprawek AI',
    'auditPricing.feat.seats': 'Miejsca w zespole',
    'auditPricing.feat.seatsUnlimited': 'Nieograniczone',
    'auditPricing.feat.support': 'Wsparcie',
    'auditPricing.support.email': 'E-mail',
    'auditPricing.support.priority': 'Priorytetowe',
    'auditPricing.support.dedicated': 'Dedykowane',
  },
  ru: {
    'auditPricing.kicker': 'Аудит',
    'auditPricing.title': 'Цены на аудит',
    'auditPricing.subtitle': 'Глубокие проверки безопасности на передовом ИИ. Выберите план для вашей команды.',
    'auditPricing.perMonth': '/ мес.',
    'auditPricing.popular': 'Самый популярный',
    'auditPricing.cta.paid': 'Обновить сейчас',
    'auditPricing.upgradeNotice': 'Обновление обрабатывается через Stripe. Цены ещё не настроены — загляните позже.',
    'auditPricing.feat.audits': 'Аудиты / месяц',
    'auditPricing.feat.auditsUnlimited': 'Неограниченно',
    'auditPricing.feat.maxFiles': 'Макс. файлов за запуск',
    'auditPricing.feat.history': 'История запусков',
    'auditPricing.feat.historyDays': '{n} дней',
    'auditPricing.feat.patch': 'Генерация исправлений ИИ',
    'auditPricing.feat.seats': 'Места в команде',
    'auditPricing.feat.seatsUnlimited': 'Неограниченно',
    'auditPricing.feat.support': 'Поддержка',
    'auditPricing.support.email': 'Электронная почта',
    'auditPricing.support.priority': 'Приоритетная',
    'auditPricing.support.dedicated': 'Выделенная',
  },
  de: {
    'auditPricing.kicker': 'Audit',
    'auditPricing.title': 'Audit-Preise',
    'auditPricing.subtitle': 'Tiefgehende Sicherheitsscans mit fortschrittlicher AI. Wählen Sie den passenden Plan für Ihr Team.',
    'auditPricing.perMonth': '/ Monat',
    'auditPricing.popular': 'Am beliebtesten',
    'auditPricing.cta.paid': 'Jetzt upgraden',
    'auditPricing.upgradeNotice': 'Das Upgrade wird über Stripe abgewickelt. Die Preise sind noch nicht konfiguriert – schauen Sie bald wieder vorbei.',
    'auditPricing.feat.audits': 'Audits / Monat',
    'auditPricing.feat.auditsUnlimited': 'Unbegrenzt',
    'auditPricing.feat.maxFiles': 'Max. Dateien pro Durchlauf',
    'auditPricing.feat.history': 'Ausführungsverlauf',
    'auditPricing.feat.historyDays': '{n} Tage',
    'auditPricing.feat.patch': 'AI-Patch-Generierung',
    'auditPricing.feat.seats': 'Team-Plätze',
    'auditPricing.feat.seatsUnlimited': 'Unbegrenzt',
    'auditPricing.feat.support': 'Support',
    'auditPricing.support.email': 'E-Mail',
    'auditPricing.support.priority': 'Priorität',
    'auditPricing.support.dedicated': 'Dediziert',
  },
  fr: {
    'auditPricing.kicker': 'Audit',
    'auditPricing.title': 'Tarifs des audits',
    'auditPricing.subtitle': 'Analyses de sécurité approfondies grâce à une AI avancée. Choisissez le forfait adapté à votre équipe.',
    'auditPricing.perMonth': '/ mois',
    'auditPricing.popular': 'Le plus populaire',
    'auditPricing.cta.paid': 'Passer à l\'offre supérieure',
    'auditPricing.upgradeNotice': 'La mise à niveau est traitée via Stripe. Les tarifs ne sont pas encore configurés — revenez bientôt.',
    'auditPricing.feat.audits': 'Audits / mois',
    'auditPricing.feat.auditsUnlimited': 'Illimité',
    'auditPricing.feat.maxFiles': 'Fichiers max. par exécution',
    'auditPricing.feat.history': 'Historique des exécutions',
    'auditPricing.feat.historyDays': '{n} jours',
    'auditPricing.feat.patch': 'Génération de correctifs par AI',
    'auditPricing.feat.seats': 'Sièges d\'équipe',
    'auditPricing.feat.seatsUnlimited': 'Illimité',
    'auditPricing.feat.support': 'Assistance',
    'auditPricing.support.email': 'E-mail',
    'auditPricing.support.priority': 'Priorité',
    'auditPricing.support.dedicated': 'Dédié',
  },
  it: {
    'auditPricing.kicker': 'Audit',
    'auditPricing.title': 'Prezzi degli audit',
    'auditPricing.subtitle': 'Scansioni di sicurezza approfondite basate su AI avanzata. Scegli il piano adatto al tuo team.',
    'auditPricing.perMonth': '/ mese',
    'auditPricing.popular': 'Più popolare',
    'auditPricing.cta.paid': 'Esegui l\'upgrade',
    'auditPricing.upgradeNotice': 'L\'upgrade viene elaborato tramite Stripe. I prezzi non sono ancora configurati: torna presto.',
    'auditPricing.feat.audits': 'Audit / mese',
    'auditPricing.feat.auditsUnlimited': 'Illimitato',
    'auditPricing.feat.maxFiles': 'Max file per esecuzione',
    'auditPricing.feat.history': 'Cronologia delle esecuzioni',
    'auditPricing.feat.historyDays': '{n} giorni',
    'auditPricing.feat.patch': 'Generazione di patch con AI',
    'auditPricing.feat.seats': 'Postazioni del team',
    'auditPricing.feat.seatsUnlimited': 'Illimitato',
    'auditPricing.feat.support': 'Supporto',
    'auditPricing.support.email': 'Email',
    'auditPricing.support.priority': 'Priorità',
    'auditPricing.support.dedicated': 'Dedicato',
  },
  ja: {
    'auditPricing.kicker': '監査',
    'auditPricing.title': '監査の料金',
    'auditPricing.subtitle': '高度な AI による詳細なセキュリティスキャン。チームに合ったプランをお選びください。',
    'auditPricing.perMonth': '/ 月',
    'auditPricing.popular': '一番人気',
    'auditPricing.cta.paid': '今すぐアップグレード',
    'auditPricing.upgradeNotice': 'アップグレードは Stripe で処理されます。料金はまだ設定されていません。しばらくしてから再度ご確認ください。',
    'auditPricing.feat.audits': '監査 / 月',
    'auditPricing.feat.auditsUnlimited': '無制限',
    'auditPricing.feat.maxFiles': '1回の実行あたりの最大ファイル数',
    'auditPricing.feat.history': '実行履歴',
    'auditPricing.feat.historyDays': '{n} 日',
    'auditPricing.feat.patch': 'AI によるパッチ生成',
    'auditPricing.feat.seats': 'チームシート',
    'auditPricing.feat.seatsUnlimited': '無制限',
    'auditPricing.feat.support': 'サポート',
    'auditPricing.support.email': 'メール',
    'auditPricing.support.priority': '優先度',
    'auditPricing.support.dedicated': '専用',
  },
  ko: {
    'auditPricing.kicker': '감사',
    'auditPricing.title': '감사 요금',
    'auditPricing.subtitle': '고급 AI 기반의 심층 보안 스캔. 팀에 맞는 요금제를 선택하세요.',
    'auditPricing.perMonth': '/ 월',
    'auditPricing.popular': '가장 인기',
    'auditPricing.cta.paid': '지금 업그레이드',
    'auditPricing.upgradeNotice': '업그레이드는 Stripe를 통해 처리됩니다. 아직 요금이 설정되지 않았습니다. 곧 다시 확인하세요.',
    'auditPricing.feat.audits': '감사 / 월',
    'auditPricing.feat.auditsUnlimited': '무제한',
    'auditPricing.feat.maxFiles': '실행당 최대 파일 수',
    'auditPricing.feat.history': '실행 기록',
    'auditPricing.feat.historyDays': '{n}일',
    'auditPricing.feat.patch': 'AI 패치 생성',
    'auditPricing.feat.seats': '팀 좌석',
    'auditPricing.feat.seatsUnlimited': '무제한',
    'auditPricing.feat.support': '지원',
    'auditPricing.support.email': '이메일',
    'auditPricing.support.priority': '우선순위',
    'auditPricing.support.dedicated': '전용',
  },
  ar: {
    'auditPricing.kicker': 'التدقيق',
    'auditPricing.title': 'أسعار التدقيق',
    'auditPricing.subtitle': 'فحوصات أمنية معمّقة مدعومة بالذكاء الاصطناعي المتقدم. اختر الخطة التي تناسب فريقك.',
    'auditPricing.perMonth': '/ شهريًا',
    'auditPricing.popular': 'الأكثر شيوعًا',
    'auditPricing.cta.paid': 'الترقية الآن',
    'auditPricing.upgradeNotice': 'تتم معالجة الترقية عبر Stripe. لم يتم إعداد الأسعار بعد، يُرجى العودة قريبًا.',
    'auditPricing.feat.audits': 'عمليات التدقيق / شهريًا',
    'auditPricing.feat.auditsUnlimited': 'غير محدود',
    'auditPricing.feat.maxFiles': 'الحد الأقصى للملفات في كل تشغيل',
    'auditPricing.feat.history': 'سجل التشغيل',
    'auditPricing.feat.historyDays': '{n} يوم',
    'auditPricing.feat.patch': 'إنشاء التصحيحات بالذكاء الاصطناعي',
    'auditPricing.feat.seats': 'مقاعد الفريق',
    'auditPricing.feat.seatsUnlimited': 'غير محدود',
    'auditPricing.feat.support': 'الدعم',
    'auditPricing.support.email': 'البريد الإلكتروني',
    'auditPricing.support.priority': 'الأولوية',
    'auditPricing.support.dedicated': 'مخصّص',
  },
}

// ─── Structured contract consumed by the pricing page ────────────────────────

export type AuditLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

export interface AuditTierCopy {
  popular?: string
  name: string
  description: string
  priceLabel: string
  perMonth: string
  features: string[]
  creditsLabel: string
  topupLabel?: string
  ctaLabel: string
}

export interface AuditPageCopy {
  pageKicker: string
  pageTitle: string
  pageSubtitle: string
  enterpriseCtaHref: string
  loadingLabel: string
  notConfigured: string
  errorLabel: string
  tiers: Record<string, AuditTierCopy>
  complianceDisclaimer: string
}

const TIER_FACTS: Record<string, {
  name: string; price: string; files: string; history: number; seats: string; support: string; popular?: boolean
}> = {
  starter:    { name: 'Starter',    price: '$29',  files: '20',        history: 30,  seats: '3',         support: 'email' },
  growth:     { name: 'Growth',     price: '$79',  files: '40',        history: 90,  seats: '10',        support: 'priority' },
  pro:        { name: 'Pro',        price: '$199', files: '60',        history: 180, seats: '25',        support: 'priority', popular: true },
  enterprise: { name: 'Enterprise', price: '$599', files: 'Unlimited', history: 365, seats: 'Unlimited', support: 'dedicated' },
}
const TIER_IDS = ['starter', 'growth', 'pro', 'enterprise']
const AUDITS_PER_MONTH: Record<string, string> = { starter: '20', growth: '100', pro: '300', enterprise: '' /* unlimited */ }
const SEATS_UNLIMITED = new Set(['enterprise'])

const EXTRA: Record<AuditLocale, { loading: string; error: string; enterpriseHref: string; topup: string; desc: Record<string, string> }> = {
  en: { loading: 'Processing…', error: 'Something went wrong. Please try again.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Instant one-time credit top-ups available',
        desc: { starter: 'For solo builders shipping often.', growth: 'Static auditing baseline for growing teams.', pro: 'Adds AI-assisted Git patch generation.', enterprise: 'Adds the full live cybersecurity suite.' } },
  es: { loading: 'Procesando…', error: 'Algo salió mal. Inténtalo de nuevo.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Recargas instantáneas de créditos disponibles',
        desc: { starter: 'Para creadores que publican a menudo.', growth: 'Base de auditoría estática para equipos en crecimiento.', pro: 'Añade generación de parches Git asistida por IA.', enterprise: 'Añade la suite completa de ciberseguridad en vivo.' } },
  pt: { loading: 'Processando…', error: 'Algo deu errado. Tente novamente.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Recargas instantâneas de créditos disponíveis',
        desc: { starter: 'Para criadores que publicam com frequência.', growth: 'Base de auditoria estática para equipes em crescimento.', pro: 'Adiciona geração de correções Git assistida por IA.', enterprise: 'Adiciona a suíte completa de cibersegurança em tempo real.' } },
  pl: { loading: 'Przetwarzanie…', error: 'Coś poszło nie tak. Spróbuj ponownie.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Dostępne natychmiastowe, jednorazowe doładowania kredytów',
        desc: { starter: 'Dla twórców publikujących często.', growth: 'Bazowy audyt statyczny dla rosnących zespołów.', pro: 'Dodaje generowanie poprawek Git wspomagane przez AI.', enterprise: 'Dodaje pełny pakiet cyberbezpieczeństwa na żywo.' } },
  ru: { loading: 'Обработка…', error: 'Что-то пошло не так. Попробуйте снова.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Доступны мгновенные разовые пополнения кредитов',
        desc: { starter: 'Для авторов, которые часто публикуют.', growth: 'Базовый статический аудит для растущих команд.', pro: 'Добавляет генерацию Git-патчей с помощью ИИ.', enterprise: 'Добавляет полный пакет кибербезопасности в реальном времени.' } },
  de: { loading: 'Wird verarbeitet…', error: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Sofortige einmalige Guthabenaufladungen verfügbar',
        desc: { starter: 'Für Einzelentwickler, die häufig veröffentlichen.', growth: 'Grundlegendes statisches Auditing für wachsende Teams.', pro: 'Ergänzt AI-gestützte Git-Patch-Generierung.', enterprise: 'Ergänzt die vollständige Live-Cybersicherheits-Suite.' } },
  fr: { loading: 'Traitement…', error: 'Une erreur s’est produite. Veuillez réessayer.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Recharges de crédits ponctuelles et instantanées disponibles',
        desc: { starter: 'Pour les créateurs indépendants qui livrent souvent.', growth: 'Socle d\'audit statique pour les équipes en croissance.', pro: 'Ajoute la génération de correctifs Git assistée par AI.', enterprise: 'Ajoute la suite complète de cybersécurité en temps réel.' } },
  it: { loading: 'Elaborazione…', error: 'Si è verificato un errore. Riprova.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'Ricariche di crediti istantanee una tantum disponibili',
        desc: { starter: 'Per chi sviluppa in autonomia e rilascia spesso.', growth: 'Base di audit statico per team in crescita.', pro: 'Aggiunge la generazione di patch Git assistita da AI.', enterprise: 'Aggiunge la suite completa di cybersicurezza in tempo reale.' } },
  ja: { loading: '処理中…', error: '問題が発生しました。もう一度お試しください。', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: '即時の単発クレジットチャージに対応',
        desc: { starter: '頻繁にリリースする個人開発者向け。', growth: '成長中のチーム向けの静的監査の基本プラン。', pro: 'AI 支援による Git パッチ生成を追加。', enterprise: 'リアルタイムのサイバーセキュリティスイート一式を追加。' } },
  ko: { loading: '처리 중…', error: '문제가 발생했습니다. 다시 시도하세요.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: '즉시 일회성 크레딧 충전 가능',
        desc: { starter: '자주 배포하는 1인 개발자용.', growth: '성장하는 팀을 위한 기본 정적 감사.', pro: 'AI 지원 Git 패치 생성이 추가됩니다.', enterprise: '전체 실시간 사이버 보안 제품군이 추가됩니다.' } },
  ar: { loading: 'جارٍ المعالجة…', error: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.', enterpriseHref: 'mailto:sales@signalboostapp.com',
        topup: 'تتوفر عمليات شحن فورية لمرة واحدة للأرصدة',
        desc: { starter: 'للمطوّرين المستقلين الذين ينشرون كثيرًا.', growth: 'أساس للتدقيق الثابت للفرق المتنامية.', pro: 'يضيف إنشاء تصحيحات Git بمساعدة الذكاء الاصطناعي.', enterprise: 'يضيف حزمة الأمن السيبراني المباشر الكاملة.' } },
}

// Static repository auditing scope (always included; ✓). Growth = standard, Pro =
// full static, Enterprise = full + custom rulesets.
const REPO_AUDIT_BY_TIER: Record<AuditLocale, Record<string, string>> = {
  en: { starter: '✓ Core repository auditing', growth: '✓ Standard static code auditing', pro: '✓ Full static code auditing', enterprise: '✓ Full static auditing + custom rulesets' },
  es: { starter: '✓ Auditoría básica del repositorio', growth: '✓ Auditoría estática estándar del código', pro: '✓ Auditoría estática completa del código', enterprise: '✓ Auditoría estática completa + reglas personalizadas' },
  pt: { starter: '✓ Auditoria básica do repositório', growth: '✓ Auditoria estática padrão do código', pro: '✓ Auditoria estática completa do código', enterprise: '✓ Auditoria estática completa + regras personalizadas' },
  pl: { starter: '✓ Podstawowy audyt repozytorium', growth: '✓ Standardowy statyczny audyt kodu', pro: '✓ Pełny statyczny audyt kodu', enterprise: '✓ Pełny audyt statyczny + własne reguły' },
  ru: { starter: '✓ Базовый аудит репозитория', growth: '✓ Стандартный статический аудит кода', pro: '✓ Полный статический аудит кода', enterprise: '✓ Полный статический аудит + свои правила' },
  de: { starter: '✓ Grundlegendes Repository-Auditing', growth: '✓ Standardmäßiges statisches Code-Auditing', pro: '✓ Vollständiges statisches Code-Auditing', enterprise: '✓ Vollständiges statisches Auditing + benutzerdefinierte Regelsätze' },
  fr: { starter: '✓ Audit de base du dépôt', growth: '✓ Audit statique standard du code', pro: '✓ Audit statique complet du code', enterprise: '✓ Audit statique complet + règles personnalisées' },
  it: { starter: '✓ Audit di base del repository', growth: '✓ Audit statico standard del codice', pro: '✓ Audit statico completo del codice', enterprise: '✓ Audit statico completo + set di regole personalizzati' },
  ja: { starter: '✓ 基本的なリポジトリ監査', growth: '✓ 標準の静的コード監査', pro: '✓ 完全な静的コード監査', enterprise: '✓ 完全な静的監査 + カスタムルールセット' },
  ko: { starter: '✓ 핵심 저장소 감사', growth: '✓ 표준 정적 코드 감사', pro: '✓ 전체 정적 코드 감사', enterprise: '✓ 전체 정적 감사 + 사용자 지정 규칙 세트' },
  ar: { starter: '✓ تدقيق أساسي للمستودع', growth: '✓ تدقيق ثابت قياسي للشيفرة', pro: '✓ تدقيق ثابت كامل للشيفرة', enterprise: '✓ تدقيق ثابت كامل + مجموعات قواعد مخصّصة' },
}

// UX integrity checks. Included from Growth up (✓); Starter excluded (❌).
const UX_INTEGRITY_BY_TIER: Record<AuditLocale, Record<string, string>> = {
  en: { starter: '❌ UX integrity checks', growth: '✓ UX integrity checks', pro: '✓ UX integrity checks', enterprise: '✓ UX integrity checks (priority)' },
  es: { starter: '❌ Comprobaciones de integridad de UX', growth: '✓ Comprobaciones de integridad de UX', pro: '✓ Comprobaciones de integridad de UX', enterprise: '✓ Comprobaciones de integridad de UX (prioritarias)' },
  pt: { starter: '❌ Verificações de integridade de UX', growth: '✓ Verificações de integridade de UX', pro: '✓ Verificações de integridade de UX', enterprise: '✓ Verificações de integridade de UX (prioritárias)' },
  pl: { starter: '❌ Kontrole integralności UX', growth: '✓ Kontrole integralności UX', pro: '✓ Kontrole integralności UX', enterprise: '✓ Kontrole integralności UX (priorytet)' },
  ru: { starter: '❌ Проверки целостности UX', growth: '✓ Проверки целостности UX', pro: '✓ Проверки целостности UX', enterprise: '✓ Проверки целостности UX (приоритет)' },
  de: { starter: '❌ UX-Integritätsprüfungen', growth: '✓ UX-Integritätsprüfungen', pro: '✓ UX-Integritätsprüfungen', enterprise: '✓ UX-Integritätsprüfungen (priorisiert)' },
  fr: { starter: '❌ Contrôles d\'intégrité UX', growth: '✓ Contrôles d\'intégrité UX', pro: '✓ Contrôles d\'intégrité UX', enterprise: '✓ Contrôles d\'intégrité UX (prioritaires)' },
  it: { starter: '❌ Controlli di integrità UX', growth: '✓ Controlli di integrità UX', pro: '✓ Controlli di integrità UX', enterprise: '✓ Controlli di integrità UX (prioritari)' },
  ja: { starter: '❌ UX 整合性チェック', growth: '✓ UX 整合性チェック', pro: '✓ UX 整合性チェック', enterprise: '✓ UX 整合性チェック（優先）' },
  ko: { starter: '❌ UX 무결성 검사', growth: '✓ UX 무결성 검사', pro: '✓ UX 무결성 검사', enterprise: '✓ UX 무결성 검사(우선 처리)' },
  ar: { starter: '❌ فحوصات سلامة تجربة المستخدم', growth: '✓ فحوصات سلامة تجربة المستخدم', pro: '✓ فحوصات سلامة تجربة المستخدم', enterprise: '✓ فحوصات سلامة تجربة المستخدم (أولوية)' },
}

// AI-assisted Git patch generation. Unlocked at Pro (✓); Starter & Growth read-only (❌).
const PATCH_BY_TIER: Record<AuditLocale, Record<string, string>> = {
  en: { starter: '❌ Read-only reports (no AI patch generation)', growth: '❌ Read-only reports (no AI patch generation)', pro: '✓ AI-assisted Git patch generation (PR patches)', enterprise: '✓ AI-assisted Git patch generation (unlimited)' },
  es: { starter: '❌ Informes de solo lectura (sin generación de parches con IA)', growth: '❌ Informes de solo lectura (sin generación de parches con IA)', pro: '✓ Generación de parches Git asistida por IA (parches PR)', enterprise: '✓ Generación de parches Git asistida por IA (ilimitada)' },
  pt: { starter: '❌ Relatórios somente leitura (sem geração de correções com IA)', growth: '❌ Relatórios somente leitura (sem geração de correções com IA)', pro: '✓ Geração de correções Git assistida por IA (correções PR)', enterprise: '✓ Geração de correções Git assistida por IA (ilimitada)' },
  pl: { starter: '❌ Raporty tylko do odczytu (bez generowania poprawek AI)', growth: '❌ Raporty tylko do odczytu (bez generowania poprawek AI)', pro: '✓ Generowanie poprawek Git wspomagane przez AI (poprawki PR)', enterprise: '✓ Generowanie poprawek Git wspomagane przez AI (bez limitu)' },
  ru: { starter: '❌ Отчёты только для чтения (без генерации патчей ИИ)', growth: '❌ Отчёты только для чтения (без генерации патчей ИИ)', pro: '✓ Генерация Git-патчей с помощью ИИ (PR-патчи)', enterprise: '✓ Генерация Git-патчей с помощью ИИ (без ограничений)' },
  de: { starter: '❌ Schreibgeschützte Berichte (keine AI-Patch-Generierung)', growth: '❌ Schreibgeschützte Berichte (keine AI-Patch-Generierung)', pro: '✓ AI-gestützte Git-Patch-Generierung (PR-Patches)', enterprise: '✓ AI-gestützte Git-Patch-Generierung (unbegrenzt)' },
  fr: { starter: '❌ Rapports en lecture seule (sans génération de correctifs par AI)', growth: '❌ Rapports en lecture seule (sans génération de correctifs par AI)', pro: '✓ Génération de correctifs Git assistée par AI (correctifs PR)', enterprise: '✓ Génération de correctifs Git assistée par AI (illimitée)' },
  it: { starter: '❌ Report di sola lettura (nessuna generazione di patch con AI)', growth: '❌ Report di sola lettura (nessuna generazione di patch con AI)', pro: '✓ Generazione di patch Git assistita da AI (patch PR)', enterprise: '✓ Generazione di patch Git assistita da AI (illimitata)' },
  ja: { starter: '❌ 閲覧専用レポート（AI によるパッチ生成なし）', growth: '❌ 閲覧専用レポート（AI によるパッチ生成なし）', pro: '✓ AI 支援による Git パッチ生成（PR パッチ）', enterprise: '✓ AI 支援による Git パッチ生成（無制限）' },
  ko: { starter: '❌ 읽기 전용 보고서(AI 패치 생성 없음)', growth: '❌ 읽기 전용 보고서(AI 패치 생성 없음)', pro: '✓ AI 지원 Git 패치 생성(PR 패치)', enterprise: '✓ AI 지원 Git 패치 생성(무제한)' },
  ar: { starter: '❌ تقارير للقراءة فقط (دون إنشاء تصحيحات بالذكاء الاصطناعي)', growth: '❌ تقارير للقراءة فقط (دون إنشاء تصحيحات بالذكاء الاصطناعي)', pro: '✓ إنشاء تصحيحات Git بمساعدة الذكاء الاصطناعي (تصحيحات PR)', enterprise: '✓ إنشاء تصحيحات Git بمساعدة الذكاء الاصطناعي (غير محدود)' },
}

// Live cybersecurity suite — ENTERPRISE ONLY. Enterprise gets three ✓ lines;
// every lower tier shows a single ❌ "Enterprise-gated" line.
const CYBER_ENTERPRISE: Record<AuditLocale, string[]> = {
  en: ['✓ Live cybersecurity vulnerability mapping', '✓ Continuous cybersecurity threat assessment', '✓ Dependency exploit tracking'],
  es: ['✓ Mapeo en vivo de vulnerabilidades de ciberseguridad', '✓ Evaluación continua de amenazas de ciberseguridad', '✓ Seguimiento de exploits en dependencias'],
  pt: ['✓ Mapeamento de vulnerabilidades de cibersegurança em tempo real', '✓ Avaliação contínua de ameaças de cibersegurança', '✓ Rastreamento de exploits em dependências'],
  pl: ['✓ Mapowanie podatności cyberbezpieczeństwa na żywo', '✓ Ciągła ocena zagrożeń cyberbezpieczeństwa', '✓ Śledzenie exploitów w zależnościach'],
  ru: ['✓ Картирование уязвимостей кибербезопасности в реальном времени', '✓ Непрерывная оценка угроз кибербезопасности', '✓ Отслеживание эксплойтов в зависимостях'],
  de: ['✓ Live-Zuordnung von Cybersicherheitsschwachstellen', '✓ Kontinuierliche Bewertung von Cybersicherheitsbedrohungen', '✓ Nachverfolgung von Exploits in Abhängigkeiten'],
  fr: ['✓ Cartographie en temps réel des vulnérabilités de cybersécurité', '✓ Évaluation continue des menaces de cybersécurité', '✓ Suivi des exploits dans les dépendances'],
  it: ['✓ Mappatura in tempo reale delle vulnerabilità di cybersicurezza', '✓ Valutazione continua delle minacce di cybersicurezza', '✓ Monitoraggio degli exploit nelle dipendenze'],
  ja: ['✓ サイバーセキュリティ脆弱性のリアルタイムマッピング', '✓ サイバーセキュリティ脅威の継続的評価', '✓ 依存関係のエクスプロイト追跡'],
  ko: ['✓ 실시간 사이버 보안 취약점 매핑', '✓ 지속적인 사이버 보안 위협 평가', '✓ 종속성 익스플로잇 추적'],
  ar: ['✓ رسم خرائط مباشر لثغرات الأمن السيبراني', '✓ تقييم مستمر لتهديدات الأمن السيبراني', '✓ تتبّع الثغرات المستغلة في التبعيات'],
}
const CYBER_LOCKED: Record<AuditLocale, string> = {
  en: '❌ Live cybersecurity suite (Enterprise)',
  es: '❌ Suite de ciberseguridad en vivo (Enterprise)',
  pt: '❌ Suíte de cibersegurança em tempo real (Enterprise)',
  pl: '❌ Pakiet cyberbezpieczeństwa na żywo (Enterprise)',
  ru: '❌ Пакет кибербезопасности в реальном времени (Enterprise)',
  de: '❌ Live-Cybersicherheits-Suite (Enterprise)',
  fr: '❌ Suite de cybersécurité en temps réel (Enterprise)',
  it: '❌ Suite di cybersicurezza in tempo reale (Enterprise)',
  ja: '❌ リアルタイムのサイバーセキュリティスイート（Enterprise）',
  ko: '❌ 실시간 사이버 보안 제품군(Enterprise)',
  ar: '❌ حزمة الأمن السيبراني المباشر (Enterprise)',
}

// Base-of-page compliance safeguard (localized). Rendered once below the grid.
const DISCLAIMER: Record<AuditLocale, string> = {
  en: 'SignalBoost provides automated compliance readiness mapping and cybersecurity posture analysis. It does not issue official compliance certifications.',
  es: 'SignalBoost ofrece mapeo automatizado de preparación para el cumplimiento y análisis de la postura de ciberseguridad. No emite certificaciones de cumplimiento oficiales.',
  pt: 'A SignalBoost fornece mapeamento automatizado de prontidão para conformidade e análise da postura de cibersegurança. Não emite certificações de conformidade oficiais.',
  pl: 'SignalBoost zapewnia zautomatyzowane mapowanie gotowości do zgodności oraz analizę stanu cyberbezpieczeństwa. Nie wydaje oficjalnych certyfikatów zgodności.',
  ru: 'SignalBoost предоставляет автоматизированное картирование готовности к соответствию и анализ состояния кибербезопасности. Он не выдаёт официальные сертификаты соответствия.',
  de: 'SignalBoost bietet automatisierte Zuordnung der Compliance-Bereitschaft und Analyse der Cybersicherheitslage. Es stellt keine offiziellen Compliance-Zertifizierungen aus.',
  fr: 'SignalBoost fournit une cartographie automatisée de la préparation à la conformité et une analyse de la posture de cybersécurité. Il ne délivre pas de certifications de conformité officielles.',
  it: 'SignalBoost offre una mappatura automatizzata della prontezza alla conformità e un\'analisi della postura di cybersicurezza. Non rilascia certificazioni di conformità ufficiali.',
  ja: 'SignalBoost は、コンプライアンス準備状況の自動マッピングとサイバーセキュリティ態勢の分析を提供します。公式のコンプライアンス認証は発行しません。',
  ko: 'SignalBoost는 자동화된 규정 준수 준비 상태 매핑과 사이버 보안 태세 분석을 제공합니다. 공식 규정 준수 인증서는 발급하지 않습니다.',
  ar: 'يوفّر SignalBoost رسم خرائط آليًا لجاهزية الامتثال وتحليلًا لوضع الأمن السيبراني، ولا يُصدر شهادات امتثال رسمية.',
}

export function getAuditPricingCopy(lang: string): AuditPageCopy {
  const loc: AuditLocale = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as AuditLocale
  const L = AUDIT_PRICING_COPY[loc] || AUDIT_PRICING_COPY.en
  const X = EXTRA[loc]

  const creditsById: Record<string, { credits: number | null; topup: boolean }> = {}
  for (const t of AUDIT_PRICING_CONFIG.tiers) creditsById[t.id] = { credits: t.monthlyCredits, topup: t.topupAvailable }

  const tiers: Record<string, AuditTierCopy> = {}
  for (const id of TIER_IDS) {
    const f = TIER_FACTS[id]
    const isEnterprise = id === 'enterprise'
    const audits = AUDITS_PER_MONTH[id] || L['auditPricing.feat.auditsUnlimited']
    const seats = SEATS_UNLIMITED.has(id) ? L['auditPricing.feat.seatsUnlimited'] : f.seats
    const files = f.files === 'Unlimited' ? L['auditPricing.feat.auditsUnlimited'] : f.files
    const historyDays = L['auditPricing.feat.historyDays'].replace('{n}', String(f.history))

    // Cybersecurity suite: three ✓ lines on Enterprise; one ❌ gate line otherwise.
    const cyber = isEnterprise ? CYBER_ENTERPRISE[loc] : [CYBER_LOCKED[loc]]

    const features: string[] = [
      `${audits} · ${L['auditPricing.feat.audits']}`,
      `${files} · ${L['auditPricing.feat.maxFiles']}`,
      `${historyDays} · ${L['auditPricing.feat.history']}`,
      REPO_AUDIT_BY_TIER[loc][id],
      UX_INTEGRITY_BY_TIER[loc][id],
      PATCH_BY_TIER[loc][id],
      ...cyber,
      `${seats} · ${L['auditPricing.feat.seats']}`,
      `${L['auditPricing.support.' + f.support]} · ${L['auditPricing.feat.support']}`,
    ].filter(Boolean)

    tiers[id] = {
      popular: f.popular ? L['auditPricing.popular'] : undefined,
      name: f.name,
      description: X.desc[id],
      priceLabel: f.price,
      perMonth: L['auditPricing.perMonth'],
      features,
      creditsLabel: formatCredits(creditsById[id] ? creditsById[id].credits : null),
      topupLabel: creditsById[id] && creditsById[id].topup ? X.topup : undefined,
      ctaLabel: L['auditPricing.cta.paid'],
    }
  }

  return {
    pageKicker: L['auditPricing.kicker'],
    pageTitle: L['auditPricing.title'],
    pageSubtitle: L['auditPricing.subtitle'],
    enterpriseCtaHref: X.enterpriseHref,
    loadingLabel: X.loading,
    notConfigured: L['auditPricing.upgradeNotice'],
    errorLabel: X.error,
    tiers,
    complianceDisclaimer: DISCLAIMER[loc] || DISCLAIMER.en,
  }
}
