// saas/lib/outreach/pressPublicationGate.ts
//
// PRESS SIDE OF THE SEPARATION RULE.
// Sales refuses publications (lib/outreach/publicationTargets.ts). Press must refuse
// the mirror image: companies, advocacy inboxes, letters desks, how-to guides, blog
// posts and asset URLs. Press REQUIRES a publication that runs stories.
//
// Deliberately zero-import and side-effect free so it can be called from the cockpit
// route, the COS tool and the background worker — the same chokepoint problem that let
// wikiHow and letters@nytimes.com in twice already.
//
// Three outcomes, not two. A binary gate over-blocks: publicationTargets.ts once fired
// on 29 of 29 real rows. 'review' means "no disqualifier found, but no publication
// evidence either" — surface it to the owner with the reason instead of guessing.

export type PressGateDecision = 'admit' | 'review' | 'refuse';

export type PressGateReason =
  | 'PRESS_TARGET_IS_PUBLICATION'
  | 'PRESS_TARGET_UNVERIFIED'
  | 'PRESS_TARGET_IS_ASSET_URL'
  | 'PRESS_TARGET_IS_LETTERS_DESK'
  | 'PRESS_TARGET_IS_HOWTO_OR_ARTICLE'
  | 'PRESS_TARGET_IS_ADVOCACY_OR_PARTY'
  | 'PRESS_TARGET_IS_COMPANY'
  | 'PRESS_TARGET_NO_CONTACT';

export interface PressTargetInput {
  publicationName?: string | null;
  editorContact?: string | null;
  url?: string | null;
  pageTitle?: string | null;
  snippet?: string | null;
}

export interface PressGateResult {
  decision: PressGateDecision;
  reason: PressGateReason;
  /** Plain sentence naming the cause. Never return a decision without one. */
  detail: string;
  /** The exact tokens that drove the decision, so a refusal can be argued with. */
  evidence: string[];
}

const lower = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/** Local part of an email address, or '' when the value is not an address. */
function localPartOf(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '';
  return email.slice(0, at);
}

function domainOf(email: string, url: string): string {
  const at = email.indexOf('@');
  if (at > 0) return email.slice(at + 1);
  const m = url.match(/^https?:\/\/([^/?#]+)/);
  return m ? m[1].replace(/^www\./, '') : '';
}

function pathOf(url: string): string {
  const m = url.match(/^https?:\/\/[^/]+(\/[^?#]*)/);
  return m ? m[1] : '';
}

function hit(haystack: string, needles: readonly string[]): string[] {
  const found: string[] = [];
  for (const n of needles) {
    if (n && haystack.includes(n)) found.push(n);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Disqualifiers — read FIRST, before any admission evidence.
// ---------------------------------------------------------------------------

/** Not a page a human reads: stylesheets, scripts, module loaders, query-string endpoints. */
const ASSET_MARKERS = [
  '.css',
  '.js',
  '.json',
  '.xml',
  '.rss',
  '.php?',
  'load.php',
  'debug=false',
  'modules=',
  '/wp-json',
  '/feed',
  '/sitemap',
] as const;

/** A real address at a real newspaper, and the wrong desk. Letters are reader opinion. */
const LETTERS_LOCAL_PARTS = [
  'letters',
  'letter',
  'lettertoeditor',
  'letterstotheeditor',
  'opinion',
  'oped',
  'cartas',
  'listy',
  'leserbriefe',
] as const;

const LETTERS_PATHS = [
  '/letters',
  '/letter-to',
  '/letters-to',
  '/submit-a-letter',
  '/opinion/letters',
  '/write-a-letter',
  'letter-writing',
] as const;

/** Instructional or evergreen content. A guide is not an outlet that runs your news. */
const HOWTO_MARKERS = [
  'how to ',
  'how-to',
  'step by step',
  'step-by-step',
  'ultimate guide',
  'a guide to',
  'beginner',
  'tutorial',
  'tips for',
  '10 ways',
  'what is ',
  'wikihow',
] as const;

const ARTICLE_PATHS = ['/blog/', '/how-to', '/guide', '/resources/', '/help/', '/support/', '/faq'] as const;

/** Campaigns, parties and causes with a press inbox. A press address is not a publication. */
const ADVOCACY_MARKERS = [
  'democrat',
  'republican',
  'dems',
  'gop',
  'labour party',
  'political party',
  'campaign committee',
  'action fund',
  'advocacy',
  'lobby',
  'petition',
  'vote for',
  'nationalpopularvote',
] as const;

/** A vendor selling something. These belong in Marketing + Sales, never in press. */
const COMPANY_LOCAL_PARTS = [
  'sales',
  'support',
  'help',
  'billing',
  'careers',
  'jobs',
  'hr',
  'legal',
  'privacy',
  'abuse',
  'security',
  'noreply',
  'no-reply',
  'hello',
  'team',
  'admin',
  'webmaster',
  'ventas',
  'soporte',
] as const;

const COMPANY_MARKERS = [
  'pricing',
  'free trial',
  'book a demo',
  'request a demo',
  'our platform',
  'our software',
  'sign up free',
  'start free',
  'saas platform',
  'app store',
  'add to cart',
  'shopify',
  'squareup',
] as const;

const COMPANY_PATHS = ['/pricing', '/product', '/products/', '/features', '/signup', '/demo', '/checkout'] as const;

// ---------------------------------------------------------------------------
// Admission evidence — a publication that runs stories.
// ---------------------------------------------------------------------------

/**
 * Editorial desks. Multi-language, because his only good targets so far were non-English.
 * 'press@' is WEAK: every company has one, and pitching a story to another company's PR
 * inbox is precisely the asymmetry this file exists to close.
 */
const STRONG_EDITORIAL_LOCAL_PARTS = [
  'editor',
  'editors',
  'editorial',
  'news',
  'newsdesk',
  'newsroom',
  'tips',
  'tip',
  'story',
  'stories',
  'pitch',
  'submissions',
  'redaccion',
  'redaccion',
  'redacao',
  'redakcja',
  'redaktion',
  'redazione',
  'noticias',
  'nachrichten',
  'redaktsiya',
] as const;

const WEAK_EDITORIAL_LOCAL_PARTS = ['press', 'pressroom', 'media', 'info', 'contact', 'contato', 'kontakt'] as const;

/**
 * Words that name a publication. STRONG words are close to conclusive; WEAK words
 * ('media', 'press', 'publishing') are carried by agencies and vendors too — kastmedia.com
 * is a sales prospect in his own queue, not an outlet — so a weak word alone never admits.
 */
const STRONG_PUBLICATION_WORDS = [
  'magazine',
  'magazin',
  'journal',
  'gazette',
  'gazeta',
  'herald',
  'tribune',
  'chronicle',
  'times',
  'daily',
  'weekly',
  'digest',
  'review',
  'newswire',
  'bulletin',
  'observer',
  'dispatch',
  'news',
  'noticias',
  'revista',
  'jornal',
  'diario',
  'wiadomosci',
  'przemysl',
  'zeitung',
  'giornale',
  'izdanie',
] as const;

const WEAK_PUBLICATION_WORDS = [
  'media',
  'press',
  'editorial',
  'publishing',
  'publication',
  'insider',
  'wire',
  'report',
  'post',
] as const;

/** Paths a publication exposes to people pitching it. */
const PRESS_SECTION_PATHS = [
  '/submit-news',
  '/news-tips',
  '/press-release',
  '/press-releases',
  '/contribute',
  '/write-for-us',
  '/editorial-guidelines',
  '/about/editorial',
  '/contact-editor',
  '/newsroom',
] as const;

/**
 * Decide whether a target may enter Press & Media.
 *
 * Order matters and is deliberate: prohibitions are read before evidence, because an
 * advocacy org with an editorial-sounding inbox must still be refused.
 */
export function classifyPressTarget(input: PressTargetInput): PressGateResult {
  const name = lower(input.publicationName);
  const email = lower(input.editorContact);
  const url = lower(input.url);
  const title = lower(input.pageTitle);
  const snippet = lower(input.snippet);

  const localPart = localPartOf(email);
  const domain = domainOf(email, url);
  const path = pathOf(url);
  const text = [name, title, snippet].filter(Boolean).join(' ');
  const identity = [name, title, domain].filter(Boolean).join(' ');

  if (!email && !url) {
    return {
      decision: 'refuse',
      reason: 'PRESS_TARGET_NO_CONTACT',
      detail: 'No editor address and no page URL, so there is nothing to verify or pitch.',
      evidence: [],
    };
  }

  const assets = hit(url, ASSET_MARKERS);
  if (assets.length > 0) {
    return {
      decision: 'refuse',
      reason: 'PRESS_TARGET_IS_ASSET_URL',
      detail: `The URL points at a file or endpoint, not an outlet (${assets.join(', ')}).`,
      evidence: assets,
    };
  }

  const letters = [
    ...LETTERS_LOCAL_PARTS.filter((p) => localPart === p || localPart.startsWith(`${p}-`) || localPart.startsWith(`${p}.`)),
    ...hit(path, LETTERS_PATHS),
    ...hit(text, ['letter to the editor', 'letters to the editor']),
  ];
  if (letters.length > 0) {
    return {
      decision: 'refuse',
      reason: 'PRESS_TARGET_IS_LETTERS_DESK',
      detail: `This is a reader letters or opinion desk, not a newsdesk (${letters.join(', ')}).`,
      evidence: letters,
    };
  }

  const advocacy = hit(identity, ADVOCACY_MARKERS).concat(hit(text, ADVOCACY_MARKERS));
  if (advocacy.length > 0) {
    return {
      decision: 'refuse',
      reason: 'PRESS_TARGET_IS_ADVOCACY_OR_PARTY',
      detail: `This is an advocacy or political organisation with a press inbox, not a publication (${advocacy[0]}).`,
      evidence: Array.from(new Set(advocacy)),
    };
  }

  const howto = hit(text, HOWTO_MARKERS).concat(hit(path, ARTICLE_PATHS)).concat(hit(domain, ['wikihow']));
  if (howto.length > 0) {
    return {
      decision: 'refuse',
      reason: 'PRESS_TARGET_IS_HOWTO_OR_ARTICLE',
      detail: `This is a guide or article page, not an outlet that runs submitted news (${howto[0]}).`,
      evidence: Array.from(new Set(howto)),
    };
  }

  // Admission evidence, in two tiers.
  const strongInbox = STRONG_EDITORIAL_LOCAL_PARTS.filter(
    (w) => localPart === w || localPart.startsWith(`${w}-`) || localPart.startsWith(`${w}.`),
  );
  const weakInbox = WEAK_EDITORIAL_LOCAL_PARTS.filter(
    (w) => localPart === w || localPart.startsWith(`${w}-`) || localPart.startsWith(`${w}.`),
  );
  const strongWords = Array.from(new Set(hit(identity, STRONG_PUBLICATION_WORDS)));
  const weakWords = Array.from(new Set(hit(identity, WEAK_PUBLICATION_WORDS)));
  const pressSections = hit(path, PRESS_SECTION_PATHS);

  // Company signals. A role inbox alone is weak; paired with sales copy it is decisive.
  const companyInbox = COMPANY_LOCAL_PARTS.filter((w) => localPart === w || localPart.startsWith(`${w}-`));
  const companyCopy = [...hit(text, COMPANY_MARKERS), ...hit(path, COMPANY_PATHS)];
  const companySignals = Array.from(new Set([...companyInbox, ...companyCopy]));

  const strongAdmission = [...strongInbox, ...strongWords, ...pressSections];
  if (strongAdmission.length > 0) {
    return {
      decision: 'admit',
      reason: 'PRESS_TARGET_IS_PUBLICATION',
      detail: `Recognised as a publication (${strongAdmission.slice(0, 3).join(', ')}).`,
      evidence: Array.from(new Set(strongAdmission)),
    };
  }

  if (companySignals.length > 0) {
    return {
      decision: 'refuse',
      reason: 'PRESS_TARGET_IS_COMPANY',
      detail: `This reads as a company rather than a publication (${companySignals[0]}), and companies belong in Marketing + Sales.`,
      evidence: companySignals,
    };
  }

  const weakAdmission = Array.from(new Set([...weakInbox, ...weakWords]));
  if (weakAdmission.length > 0) {
    return {
      decision: 'review',
      reason: 'PRESS_TARGET_UNVERIFIED',
      detail: `Only weak evidence of a publication (${weakAdmission.join(', ')}) — agencies and vendors carry these words too. Confirm the outlet before pitching it.`,
      evidence: weakAdmission,
    };
  }

  return {
    decision: 'review',
    reason: 'PRESS_TARGET_UNVERIFIED',
    detail:
      'Nothing disqualifies this target, but nothing identifies it as a publication either. Confirm the outlet before pitching it.',
    evidence: [],
  };
}

/** Convenience for call sites that only need the boolean plus a stated reason. */
export function pressAdmits(input: PressTargetInput): { ok: boolean; reason: string } {
  const result = classifyPressTarget(input);
  return { ok: result.decision === 'admit', reason: result.detail };
}
