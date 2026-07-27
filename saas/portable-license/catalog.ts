// saas/portable-license/catalog.ts
//
// What a licence is allowed to say.
//
// The licensing layer can gate any string you put in `features`, which means a
// typo produces a licence that silently unlocks nothing — the buyer paid, the
// gate refuses, and nobody finds out until an incident. This file is the list
// of names that actually correspond to a capability in the code, so issuance
// can be checked against reality instead of against intent.
//
// TWO RULES ABOUT WHAT MAY BE GATED, and they are not negotiable per-deal:
//
//   1. Nothing that lets a buyer OBSERVE their own system is gated. Incident
//      history, audit records and SIEM export are available in every edition.
//      Charging for the ability to see what happened in your own infrastructure
//      turns a licence into leverage during an incident.
//
//   2. Nothing that weakens the approval gate is gated. The safety property is
//      not a premium feature. There is no edition in which consequential steps
//      execute without a named human.
//
// The edition → feature mapping below is a STARTING POINT and a commercial
// decision, not a technical one. Change the mapping freely; do not add feature
// names that no code checks.

export interface CatalogFeature {
  id: string;
  summary: string;
  /** Why it is separable — or why it must never be gated. */
  note?: string;
}

export interface ProductCatalog {
  productId: string;
  features: CatalogFeature[];
  /** Always granted, in every edition, including the cheapest. */
  alwaysIncluded: string[];
  editions: Record<string, string[]>;
}

export const SELF_HEALING_CATALOG: ProductCatalog = {
  productId: 'self-healing-supervisor',
  features: [
    {
      id: 'incident.observe',
      summary: 'Read incident history, dispatch ledger and audit records.',
      note: 'Never gated. See rule 1.',
    },
    {
      id: 'siem.export',
      summary: "Emit audit events to the buyer's SIEM as ECS-JSON or CEF.",
      note: "Never gated. A buyer's security team must not lose visibility over a billing question.",
    },
    {
      id: 'approval.gating',
      summary: 'Classify consequential steps and route them to a named approver.',
      note: "Never gated. See rule 2 — this is the product's safety property.",
    },
    {
      id: 'repair.plan',
      summary: 'Generate a repair plan from an incident, with verification steps.',
    },
    {
      id: 'repair.dispatch',
      summary: 'Execute approved repair steps.',
      note: 'The core paid capability: planning without dispatch is advice, dispatch is the product doing work.',
    },
    {
      id: 'repair.api-steps',
      summary: "Repair steps that call an API through the buyer's ApiStepRunner.",
    },
    {
      id: 'repair.browser-steps',
      summary: 'Repair steps driven through a browser runtime.',
      note: 'Separable because it needs a Chromium runtime the buyer or a provider operates.',
    },
  ],

  alwaysIncluded: ['incident.observe', 'siem.export', 'approval.gating'],

  editions: {
    standard: ['repair.plan', 'repair.dispatch', 'repair.api-steps'],
    enterprise: ['repair.plan', 'repair.dispatch', 'repair.api-steps', 'repair.browser-steps'],
  },
};

export const PRESS_MEDIA_CATALOG: ProductCatalog = {
  productId: 'press-media',
  features: [
    {
      id: 'press.observe',
      summary: 'Read campaign history, dispatch state and proof records.',
      note: 'Never gated. See rule 1.',
    },
    {
      id: 'press.factual-discipline',
      summary:
        'The anti-fabrication kernel: generated copy states only supplied facts and leaves a visible [PLACEHOLDER] for anything it was not given.',
      note:
        'Never gated, and this one is not negotiable at any price. Selling a cheaper edition that may invent a product name means selling the buyer a reputational incident.',
    },
    {
      id: 'press.owner-approval',
      summary: 'The approval queue and the spend gate: nothing dispatches, and no money is committed, without a human.',
      note: 'Never gated. See rule 2.',
    },
    {
      id: 'press.audit-export',
      summary: "Emit press events to the buyer's SIEM as ECS-JSON or CEF.",
      note: 'Never gated.',
    },
    {
      id: 'press.compose',
      summary: "Generate campaign copy through the buyer's own AiPort.",
    },
    {
      id: 'press.free-submission',
      summary: 'Submit a release to a verified editor contact by email.',
    },
    {
      id: 'press.wire',
      summary: 'PR wire distribution with a distribution report as proof.',
      note: "Separable: billed per release on the buyer's own wire account.",
    },
    {
      id: 'press.media-database',
      summary: 'Verify journalist contacts against a media database before dispatch.',
      note: "Separable: needs the buyer's own Cision/Muck Rack style subscription.",
    },
    {
      id: 'press.ad-platform',
      summary: 'Budgeted paid distribution through an ad platform, with a real-time report.',
      note: "Separable: spend runs on the buyer's own ad account and always hits the spend gate.",
    },
    {
      id: 'press.direct-io',
      summary: 'Insertion-order workflow for print, TV and radio, with a tearsheet as proof.',
      note: 'Separable, and inherently manual — there is no API behind it.',
    },
  ],

  alwaysIncluded: ['press.observe', 'press.factual-discipline', 'press.owner-approval', 'press.audit-export'],

  editions: {
    standard: ['press.compose', 'press.free-submission'],
    enterprise: [
      'press.compose',
      'press.free-submission',
      'press.wire',
      'press.media-database',
      'press.ad-platform',
      'press.direct-io',
    ],
  },
};

export const PROVIDER_HUB_CATALOG: ProductCatalog = {
  productId: 'provider-hub',
  features: [
    {
      id: 'hub.observe',
      summary: 'Read connection metadata and the evidence record of every live-data read.',
      note: 'Never gated. See rule 1.',
    },
    {
      id: 'hub.read-evidence',
      summary: 'Produce a schema-versioned evidence record for each read, without exposing payloads or credentials.',
      note: 'Never gated: it is the artifact a buyer shows their auditor.',
    },
    {
      id: 'hub.approval',
      summary: 'Route provider actions through the approval port before they execute.',
      note: 'Never gated. See rule 2.',
    },
    {
      id: 'hub.audit',
      summary: "Emit provider events to the buyer's audit sink.",
      note: 'Never gated.',
    },
    {
      id: 'hub.connection-metadata',
      summary: 'Create and persist provider connection metadata against the buyer\'s own store.',
    },
    {
      id: 'hub.live-data-read',
      summary: "Perform a bounded, authorized provider read through the buyer's transport and credentials.",
      note: 'The core paid capability: metadata without reads is a directory, reads are the product doing work.',
    },
  ],

  alwaysIncluded: ['hub.observe', 'hub.read-evidence', 'hub.approval', 'hub.audit'],

  editions: {
    standard: ['hub.connection-metadata'],
    enterprise: ['hub.connection-metadata', 'hub.live-data-read'],
  },
};

const CATALOGS: Record<string, ProductCatalog> = {
  [SELF_HEALING_CATALOG.productId]: SELF_HEALING_CATALOG,
  [PRESS_MEDIA_CATALOG.productId]: PRESS_MEDIA_CATALOG,
  [PROVIDER_HUB_CATALOG.productId]: PROVIDER_HUB_CATALOG,
};

export function catalogFor(productId: string): ProductCatalog | null {
  return CATALOGS[productId] ?? null;
}

/**
 * Every catalogue. Exported so the invariant tests run against ALL products
 * rather than a hand-picked one — a new catalogue inherits the two rules
 * automatically instead of being trusted to remember them.
 */
export function allCatalogs(): ProductCatalog[] {
  return Object.values(CATALOGS);
}

export function catalogedProductIds(): string[] {
  return Object.keys(CATALOGS);
}

export function knownFeatureIds(productId: string): string[] {
  const catalog = catalogFor(productId);
  return catalog ? catalog.features.map((f) => f.id) : [];
}

/** Feature names in `features` that no capability in the code checks. */
export function unknownFeatures(productId: string, features: readonly string[]): string[] {
  const known = new Set(knownFeatureIds(productId));
  return features.filter((f) => !known.has(f));
}

/**
 * The full feature list for an edition: its own set plus everything that is
 * always included. Returns null for an edition the catalogue does not define,
 * so a typo'd edition name cannot silently produce an empty licence.
 */
export function featuresForEdition(productId: string, edition: string): string[] | null {
  const catalog = catalogFor(productId);
  if (!catalog) return null;
  const own = catalog.editions[edition];
  if (!own) return null;
  return [...new Set([...catalog.alwaysIncluded, ...own])].sort();
}

export function editionNames(productId: string): string[] {
  const catalog = catalogFor(productId);
  return catalog ? Object.keys(catalog.editions) : [];
}

/**
 * Throws if the requested features name something the code does not check.
 * Called at ISSUANCE, not at verification: a licence that has already been
 * signed and sent is too late to correct, and the buyer would experience the
 * mistake as a refusal rather than as a typo.
 */
export function assertIssuableFeatures(productId: string, features: readonly string[]): void {
  const catalog = catalogFor(productId);
  if (!catalog) {
    throw new Error(
      `No feature catalogue for product "${productId}". Add one to catalog.ts before issuing licences for it, ` +
        `or the feature names in the licence cannot be checked against anything.`,
    );
  }
  if (features.length === 0) {
    throw new Error('A licence with no features unlocks nothing.');
  }
  const unknown = unknownFeatures(productId, features);
  if (unknown.length) {
    throw new Error(
      `Unknown feature(s) for "${productId}": ${unknown.join(', ')}. ` +
        `Known features: ${knownFeatureIds(productId).join(', ')}. ` +
        `A feature name no code checks is a licence that silently unlocks nothing.`,
    );
  }
}
