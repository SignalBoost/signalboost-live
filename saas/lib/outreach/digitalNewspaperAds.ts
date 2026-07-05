// saas/lib/outreach/digitalNewspaperAds.ts
// Safe preparation layer for digital free-newspaper / classified ad placements.
// This module creates owner-reviewable ad packages only. It does not scrape,
// bypass paywalls, auto-submit forms, or post to third-party sites.

export type DigitalNewspaperAdFormat = 'classified' | 'community_notice' | 'business_spotlight' | 'sponsored_blurb'

export type DigitalNewspaperAdTarget = {
  id: string
  name: string
  channelType: 'digital_newspaper' | 'community_classifieds' | 'local_business_directory'
  region: string
  language: 'en' | 'es' | 'pt' | 'pl' | 'ru'
  categoryHints: string[]
  submissionMode: 'manual_review' | 'api_when_available'
  notes: string[]
}

export type DigitalNewspaperAdInput = {
  productName?: string
  offer?: string
  audience?: string
  region?: string
  language?: 'en' | 'es' | 'pt' | 'pl' | 'ru'
  landingUrl?: string
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

function normalizeInput(input: DigitalNewspaperAdInput): Required<DigitalNewspaperAdInput> {
  return {
    productName: input.productName?.trim() || 'SignalBoostAi',
    offer: input.offer?.trim() || 'AI websites, reviews, outreach, and campaign tools for small businesses',
    audience: input.audience?.trim() || 'local businesses that want more visibility and better digital marketing',
    region: input.region?.trim() || 'local market',
    language: input.language || 'en',
    landingUrl: input.landingUrl?.trim() || 'https://www.saas.signalboostapp.com',
    adFormat: input.adFormat || 'classified',
    targetNames: input.targetNames || [],
  }
}

function copyForLanguage(input: Required<DigitalNewspaperAdInput>) {
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

  return {
    headline: `${product}: AI-powered growth for local businesses`,
    shortBody: `${product} helps local businesses build websites, reviews, content, outreach, and campaigns with AI support.`,
    longBody: `${product} helps ${audience} improve their digital presence with ${offer}. The platform keeps human approval before publishing or sending campaigns.`,
    callToAction: `Learn more: ${url}`,
    disclosure: 'Commercial advertisement. Placement is subject to each publisher, classifieds board, or directory policy.',
  }
}

function buildTargets(input: Required<DigitalNewspaperAdInput>): DigitalNewspaperAdTarget[] {
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
  const normalized = normalizeInput(input)
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
    ],
  }
}
