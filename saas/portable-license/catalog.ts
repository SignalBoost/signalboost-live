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

const CATALOGS: Record<string, ProductCatalog> = {
  [SELF_HEALING_CATALOG.productId]: SELF_HEALING_CATALOG,
};

export function catalogFor(productId: string): ProductCatalog | null {
  return CATALOGS[productId] ?? null;
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
