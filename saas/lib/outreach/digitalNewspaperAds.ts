// saas/lib/outreach/digitalNewspaperAds.ts
// Safe preparation layer for digital free-newspaper / classified ad placements.
// This module creates owner-reviewable ad packages only. It does not scrape,
// bypass paywalls, auto-submit forms, or post to third-party sites.

import { getAdLandingPage, getNewspaperAdLandingPageOptions, type AdLandingPage, type AdLandingPageGoal } from '@/lib/outreach/adLandingPages'

export type DigitalNewspaperAdFormat = 'classified' | 'community_notice' | 'business_spotlight' | 'sponsored_blurb'

export type DigitalNewspaperAdTarget = {
  id: string
  name: string
  channelType: 'digital_newspaper' | 'community_classifieds' | 'local_business_directory'
  region: string
  language: 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
  categoryHints: string[]
  submissionMode: 'manual_review' | 'api_when_available'
  notes: string[]
}

export type DigitalNewspaperAdInput = {
  productName?: string
  offer?: string
  audience?: string
  region?: string
  language?: 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
  landingUrl?: string
  landingPageGoal?: AdLandingPageGoal
  adFormat?: DigitalNewspaperAdFormat
  targetNames?: string[]
}

export type DigitalNewspaperAdPackage = {
  channel: 'digital_newspaper_ads'
  status: 'draft_requires_owner_review'
  safety: {
    autoPostEnabled: false
    requiresOwnerApproval: true
    respectsPublisherTerms: true
    noMassPosting: true
  }
  input: Required<DigitalNewspaperAdInput>
  landingPage: AdLandingPage
  landingPageOptions: AdLandingPage[]
  targets: DigitalNewspaperAdTarget[]
  adCopy: {
    headline: string
    shortBody: string
    longBody: string
    callToAction: string
    disclosure: string
  }
  submissionChecklist: string[]
  nextSteps: string[]
}

const DEFAULT_TARGETS: DigitalNewspaperAdTarget[] = [
  {
    id: 'local-free-digital-newspaper',
    name: 'Local free digital newspaper',
    channelType: 'digital_newspaper',
    region: 'local',
    language: 'en',
    categoryHints: ['Business services', 'Local business', 'Technology', 'Community announcements'],
    submissionMode: 'manual_review',
    notes: ['Use publisher ad/classified rules.', 'Avoid duplicate submissions.', 'Confirm whether business ads are allowed.'],
  },
  {
    id: 'community-classifieds',
    name: 'Community classifieds board',
    channelType: 'community_classifieds',
    region: 'local',
    language: 'en',
    categoryHints: ['Services', 'Small business', 'Marketing', 'Local offers'],
    submissionMode: 'manual_review',
    notes: ['Use one approved listing per community/category.', 'Do not repost repeatedly.', 'Track approval or rejection manually.'],
  },
  {
    id: 'local-business-directory',
    name: 'Local business directory listing',
    channelType: 'local_business_directory',
    region: 'local',
    language: 'en',
    categoryHints: ['Business growth', 'Digital marketing', 'AI tools', 'Website services'],
    submissionMode: 'manual_review',
    notes: ['Prefer evergreen copy.', 'Use direct business contact details.', 'Verify listing ownership rules.'],
  },
]

type NormalizedDigitalNewspaperAdInput = Required<DigitalNewspaperAdInput>

function normalizeInput(input: DigitalNewspaperAdInput, landingPage: AdLandingPage): NormalizedDigitalNewspaperAdInput {
  return {
    // NEVER default a user's ad to the platform's own brand or pitch: an unnamed ad must show
    // a visible gap the user can fill, not somebody else's company.
    productName: input.productName?.trim() || '[YOUR COMPANY]',
    offer: input.offer?.trim() || '[WHAT YOU OFFER]',
    audience: input.audience?.trim() || 'local businesses that want more visibility and better digital marketing',
    region: input.region?.trim() || 'local market',
    language: input.language || 'en',
    landingUrl: input.landingUrl?.trim() || landingPage.url,
    landingPageGoal: landingPage.goal,
    adFormat: input.adFormat || 'classified',
    targetNames: input.targetNames || [],
  }
}

function copyForLanguage(input: NormalizedDigitalNewspaperAdInput) {
  const product = input.productName
  const offer = input.offer
  const audience = input.audience
  const url = input.landingUrl

  if (input.language === 'es') {
    return {
      headline: `${product}: crecimiento digital con IA para negocios locales`,
      shortBody: `${product} ayuda a negocios locales con sitios web, reseñas, contenido y campañas de alcance impulsadas por IA.`,
      longBody: `${product} ayuda a ${audience} a mejorar su presencia digital con ${offer}. La plataforma mantiene aprobación humana antes de publicar o enviar campañas.`,
      callToAction: `Conoce más: ${url}`,
      disclosure: 'Anuncio comercial. La publicación depende de las reglas del medio o directorio.',
    }
  }

  if (input.language === 'pt') {
    return {
      headline: `${product}: crescimento digital com IA para negócios locais`,
      shortBody: `${product} ajuda negócios locais com sites, avaliações, conteúdo e campanhas de alcance com IA.`,
      longBody: `${product} ajuda ${audience} a melhorar presença digital com ${offer}. A plataforma mantém aprovação humana antes de publicar ou enviar campanhas.`,
      callToAction: `Saiba mais: ${url}`,
      disclosure: 'Anúncio comercial. A publicação depende das regras do jornal, classificado ou diretório.',
    }
  }

  if (input.language === 'pl') {
    return {
      headline: `${product}: rozwój cyfrowy z AI dla lokalnych firm`,
      shortBody: `${product} pomaga lokalnym firmom w stronach internetowych, opiniach, treściach i kampaniach AI.`,
      longBody: `${product} pomaga ${audience} poprawić obecność online przez ${offer}. Platforma zachowuje zatwierdzenie człowieka przed publikacją lub wysyłką kampanii.`,
      callToAction: `Dowiedz się więcej: ${url}`,
      disclosure: 'Ogłoszenie komercyjne. Publikacja zależy od zasad wydawcy lub katalogu.',
    }
  }

  if (input.language === 'ru') {
    return {
      headline: `${product}: цифровой рост с ИИ для местного бизнеса`,
      shortBody: `${product} помогает местному бизнесу с сайтами, отзывами, контентом и кампаниями на базе ИИ.`,
      longBody: `${product} помогает ${audience} улучшить онлайн-присутствие через ${offer}. Платформа сохраняет человеческое одобрение перед публикацией или отправкой кампаний.`,
      callToAction: `Подробнее: ${url}`,
      disclosure: 'Коммерческое объявление. Публикация зависит от правил издания или каталога.',
    }
  }

  if (input.language === 'de') {
    return {
      headline: `${product}: KI-gestütztes digitales Wachstum für lokale Unternehmen`,
      shortBody: `${product} unterstützt lokale Unternehmen mit KI-gestützten Websites, Bewertungen, Inhalten und Outreach-Kampagnen.`,
      longBody: `${product} hilft ${audience}, ihre Online-Präsenz mit ${offer} zu verbessern. Die Plattform behält die menschliche Freigabe bei, bevor Kampagnen veröffentlicht oder versendet werden.`,
      callToAction: `Mehr erfahren: ${url}`,
      disclosure: 'Werbeanzeige. Die Veröffentlichung richtet sich nach den Regeln der Zeitung, des Kleinanzeigenportals oder des Verzeichnisses.',
    }
  }

  if (input.language === 'fr') {
    return {
      headline: `${product} : croissance numérique propulsée par l’IA pour les entreprises locales`,
      shortBody: `${product} aide les entreprises locales avec des sites web, des avis, du contenu et des campagnes de prospection propulsés par l’IA.`,
      longBody: `${product} aide ${audience} à améliorer leur présence en ligne grâce à ${offer}. La plateforme conserve une validation humaine avant toute publication ou tout envoi de campagne.`,
      callToAction: `En savoir plus : ${url}`,
      disclosure: 'Annonce commerciale. La publication dépend des règles du journal, du site de petites annonces ou de l’annuaire.',
    }
  }

  if (input.language === 'it') {
    return {
      headline: `${product}: crescita digitale con l’IA per le attività locali`,
      shortBody: `${product} aiuta le attività locali con siti web, recensioni, contenuti e campagne di outreach basati sull’IA.`,
      longBody: `${product} aiuta ${audience} a migliorare la presenza online con ${offer}. La piattaforma mantiene l’approvazione umana prima di pubblicare o inviare campagne.`,
      callToAction: `Scopri di più: ${url}`,
      disclosure: 'Annuncio commerciale. La pubblicazione dipende dalle regole del giornale, della bacheca annunci o della directory.',
    }
  }

  if (input.language === 'ja') {
    return {
      headline: `${product}:地域ビジネスのための AI によるデジタル成長`,
      shortBody: `${product} は、AI を活用したウェブサイト、レビュー、コンテンツ、アウトリーチキャンペーンで地域ビジネスを支援します。`,
      longBody: `${product} は、${offer} によって ${audience} のオンラインでの存在感を高めます。キャンペーンの公開や送信の前には、必ず人による承認を行います。`,
      callToAction: `詳しくはこちら:${url}`,
      disclosure: '広告です。掲載可否は新聞、案内広告、またはディレクトリの規定によります。',
    }
  }

  if (input.language === 'ko') {
    return {
      headline: `${product}: 지역 비즈니스를 위한 AI 기반 디지털 성장`,
      shortBody: `${product}은(는) AI 기반 웹사이트, 리뷰, 콘텐츠, 아웃리치 캠페인으로 지역 비즈니스를 지원합니다.`,
      longBody: `${product}은(는) ${offer}을(를) 통해 ${audience}의 온라인 존재감을 높입니다. 플랫폼은 캠페인을 게시하거나 발송하기 전에 사람의 승인을 거칩니다.`,
      callToAction: `자세히 알아보기: ${url}`,
      disclosure: '광고입니다. 게재 여부는 신문, 안내 광고 또는 디렉터리의 규정에 따릅니다.',
    }
  }

  if (input.language === 'ar') {
    return {
      headline: `${product}: نمو رقمي مدعوم بالذكاء الاصطناعي للشركات المحلية`,
      shortBody: `تساعد ${product} الشركات المحلية في المواقع الإلكترونية والتقييمات والمحتوى وحملات التواصل المدعومة بالذكاء الاصطناعي.`,
      longBody: `تساعد ${product} ${audience} على تحسين حضورها الرقمي من خلال ${offer}. وتحافظ المنصة على موافقة بشرية قبل نشر الحملات أو إرسالها.`,
      callToAction: `اعرف المزيد: ${url}`,
      disclosure: 'إعلان تجاري. يخضع النشر لقواعد الصحيفة أو موقع الإعلانات المبوبة أو الدليل.',
    }
  }

  return {
    headline: `${product}: AI-powered growth for local businesses`,
    shortBody: `${product} helps local businesses build websites, reviews, content, outreach, and campaigns with AI support.`,
    longBody: `${product} helps ${audience} improve their digital presence with ${offer}. The platform keeps human approval before publishing or sending campaigns.`,
    callToAction: `Learn more: ${url}`,
    disclosure: 'Commercial advertisement. Placement is subject to each publisher, classifieds board, or directory policy.',
  }
}

function buildTargets(input: NormalizedDigitalNewspaperAdInput): DigitalNewspaperAdTarget[] {
  if (!input.targetNames.length) {
    return DEFAULT_TARGETS.map(target => ({ ...target, region: input.region, language: input.language }))
  }

  return input.targetNames.map((name, index) => ({
    id: `custom-news-target-${index + 1}`,
    name,
    channelType: 'digital_newspaper' as const,
    region: input.region,
    language: input.language,
    categoryHints: ['Business services', 'Local offers', 'Technology', 'Small business'],
    submissionMode: 'manual_review' as const,
    notes: ['Custom target supplied by owner.', 'Verify submission policy before posting.', 'Record final URL/status after submission.'],
  }))
}

export function buildDigitalNewspaperAdPackage(input: DigitalNewspaperAdInput = {}): DigitalNewspaperAdPackage {
  const landingPage = getAdLandingPage(input.landingPageGoal)
  const normalized = normalizeInput(input, landingPage)
  const adCopy = copyForLanguage(normalized)

  return {
    channel: 'digital_newspaper_ads',
    status: 'draft_requires_owner_review',
    safety: {
      autoPostEnabled: false,
      requiresOwnerApproval: true,
      respectsPublisherTerms: true,
      noMassPosting: true,
    },
    input: normalized,
    landingPage,
    landingPageOptions: getNewspaperAdLandingPageOptions(),
    targets: buildTargets(normalized),
    adCopy,
    submissionChecklist: [
      'Confirm the newspaper/classified site allows business or commercial ads.',
      'Choose the closest allowed category before submitting.',
      'Use only the approved ad copy and correct landing URL.',
      'Avoid duplicate posts to the same site/category.',
      'Record submitted/pending/approved/rejected status after submission.',
    ],
    nextSteps: [
      'Add exact target newspaper names and URLs.',
      'Map each target to category, contact form, or ad submission page.',
      'Add owner approval before any real posting workflow.',
      'Only add API posting where the publisher explicitly provides API or written permission.',
    ]
  }
}
