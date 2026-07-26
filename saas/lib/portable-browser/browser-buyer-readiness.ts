// saas/lib/portable-browser/browser-buyer-readiness.ts
//
// WHAT A BUYER HAS TO SUPPLY, PER VENDOR — the missing half of the adapter catalog.
//
// The catalog already describes 27 browser vendors richly: category, deployment models,
// authentication modes, evidence and observability capabilities, compliance metadata keys.
// What almost none of them stated was the one thing a Fortune-500 integration team actually
// needs on day one — WHICH FIELDS DO WE FILL IN. Every one of the twenty-seven shipped
// `configurationFieldDefinitions: []`, so a buyer could read the whole catalog and still not
// know whether their stack needed a hub URL, a region, a project id, or a credential. All
// twenty-seven now declare one, and a test fails if a new vendor arrives without.
//
// A vendor entry that cannot tell a buyer what to provide is a brochure, not an integration
// surface. This module makes the contract explicit, checkable, and honest in both
// directions:
//
//   • It reports what is MISSING from a buyer's supplied configuration, by field, with the
//     vendor's own description — so the answer to "why can't we connect" is a list, not a
//     support ticket.
//   • It reports which vendors still have NO contract declared, rather than letting an empty
//     contract read as "nothing required". An empty declaration is a gap, and
//     summarizeCatalogBuyerReadiness names every vendor that still has one.
//
// CREDENTIALS ARE NEVER FIELDS. Anything secret is declared as an 'opaque_reference' — the
// buyer supplies a POINTER into their own vault, and the value is resolved at run time by
// their credential broker. This module rejects a value that looks like a raw secret rather
// than a reference, so a pasted API key fails validation instead of quietly ending up in a
// configuration record.

import type { PortableBrowserAdapterDescriptor } from './browser-adapter-descriptor.ts'
import type { PortableBrowserConfigurationField } from './browser-runtime-types.ts'

export type BuyerSuppliedConfiguration = Readonly<Record<string, unknown>>

export interface BrowserConfigurationProblem {
  key: string
  /** 'missing' | 'wrong_type' | 'invalid_url' | 'not_permitted_scheme' | 'not_in_options' | 'raw_secret' */
  problem: string
  /** The vendor's own description of the field, so the message is actionable. */
  description: string
}

export interface BrowserAdapterBuyerReadiness {
  adapterId: string
  displayName: string
  implementationStatus: PortableBrowserAdapterDescriptor['implementationStatus']
  /** False when the vendor entry declares no configuration contract at all. */
  declaresConfigurationContract: boolean
  /** True only when a contract exists AND everything required was supplied and valid. */
  ready: boolean
  problems: readonly BrowserConfigurationProblem[]
  /** Keys supplied that the vendor does not declare. Not fatal; surfaced so typos show up. */
  unrecognizedKeys: readonly string[]
  /** Plain-language result for an integration engineer reading a checklist. */
  summary: string
}

/**
 * A secret pasted where a reference belongs. Deliberately conservative: it catches the
 * common vendor key shapes rather than trying to recognize every secret in the world, and
 * it never inspects a value it was not given.
 */
const RAW_SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  /^[A-Za-z0-9+/]{40,}={0,2}$/,
  /^bearer\s+/i,
  /^AKIA[0-9A-Z]{12,}$/,
])

/** A vendor-prefixed key (an `sk_`/`api_`/`token_` style prefix). Separate because it needs an entropy check. */
const VENDOR_PREFIXED_KEY = /^(sk|pk|rk|api|key|token|secret)[-_][A-Za-z0-9_-]{16,}$/i

function looksLikeRawSecret(value: string): boolean {
  const trimmed = value.trim()
  if (RAW_SECRET_PATTERNS.some((pattern) => pattern.test(trimmed))) return true
  // A vendor-prefixed key only counts when its tail looks generated rather than named:
  // a prefix plus a generated tail is a secret; `secret_manager_reference` is a name a buyer chose.
  return VENDOR_PREFIXED_KEY.test(trimmed) && /[A-Z]/.test(trimmed.slice(3)) && /[0-9A-Z]/.test(trimmed.slice(3))
}

function checkField(
  field: PortableBrowserConfigurationField,
  supplied: BuyerSuppliedConfiguration,
): BrowserConfigurationProblem | null {
  const present = Object.prototype.hasOwnProperty.call(supplied, field.key)
  const value = supplied[field.key]

  if (!present || value === undefined || value === null || value === '') {
    return field.required ? { key: field.key, problem: 'missing', description: field.description } : null
  }

  const problem = (kind: string): BrowserConfigurationProblem => ({
    key: field.key,
    problem: kind,
    description: field.description,
  })

  switch (field.type) {
    case 'string':
      return typeof value === 'string' ? null : problem('wrong_type')
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : problem('wrong_type')
    case 'boolean':
      return typeof value === 'boolean' ? null : problem('wrong_type')
    case 'enum':
      if (typeof value !== 'string') return problem('wrong_type')
      return field.options?.includes(value) ? null : problem('not_in_options')
    case 'opaque_reference':
      if (typeof value !== 'string') return problem('wrong_type')
      // A reference points at a secret. It is not the secret.
      return looksLikeRawSecret(value) ? problem('raw_secret') : null
    case 'url': {
      if (typeof value !== 'string') return problem('wrong_type')
      let parsed: URL
      try {
        parsed = new URL(value)
      } catch {
        return problem('invalid_url')
      }
      // Transport must be encrypted. A plaintext endpoint is not an enterprise integration.
      return /^(https|wss):$/.test(parsed.protocol) ? null : problem('not_permitted_scheme')
    }
    default:
      return problem('wrong_type')
  }
}

/** Check one vendor against what a buyer supplied. Pure: no network, no environment. */
export function describeBrowserAdapterBuyerReadiness(
  descriptor: PortableBrowserAdapterDescriptor,
  supplied: BuyerSuppliedConfiguration = {},
): BrowserAdapterBuyerReadiness {
  const fields = descriptor.configurationFieldDefinitions ?? []
  const declaresConfigurationContract = fields.length > 0

  const problems: BrowserConfigurationProblem[] = []
  for (const field of fields) {
    const problem = checkField(field, supplied)
    if (problem) problems.push(problem)
  }

  const declared = new Set(fields.map((field) => field.key))
  const unrecognizedKeys = Object.keys(supplied).filter((key) => !declared.has(key))

  const ready = declaresConfigurationContract && problems.length === 0

  const summary = !declaresConfigurationContract
    ? `${descriptor.displayName} declares no configuration contract yet, so a buyer cannot tell what to supply. Treat it as not integrable until it does.`
    : problems.length === 0
      ? `${descriptor.displayName} has everything it declared it needs.`
      : `${descriptor.displayName} is missing or rejecting ${problems.length} configuration value${problems.length === 1 ? '' : 's'}: ${problems.map((p) => `${p.key} (${p.problem})`).join(', ')}.`

  return {
    adapterId: descriptor.adapterId,
    displayName: descriptor.displayName,
    implementationStatus: descriptor.implementationStatus,
    declaresConfigurationContract,
    ready,
    problems: Object.freeze(problems),
    unrecognizedKeys: Object.freeze(unrecognizedKeys),
    summary,
  }
}

export interface CatalogBuyerReadinessSummary {
  total: number
  /** Vendors that state what a buyer must supply. */
  withContract: readonly string[]
  /** Vendors that do not. This is the backlog, and it is meant to be read as one. */
  withoutContract: readonly string[]
}

/**
 * Catalog-wide view. Exists so the gap is a number someone can watch shrink, rather than a
 * thing discovered one integration call at a time.
 */
export function summarizeCatalogBuyerReadiness(
  descriptors: readonly PortableBrowserAdapterDescriptor[],
): CatalogBuyerReadinessSummary {
  const withContract: string[] = []
  const withoutContract: string[] = []
  for (const descriptor of descriptors) {
    const target = (descriptor.configurationFieldDefinitions ?? []).length > 0 ? withContract : withoutContract
    target.push(descriptor.adapterId)
  }
  return {
    total: descriptors.length,
    withContract: Object.freeze(withContract.sort()),
    withoutContract: Object.freeze(withoutContract.sort()),
  }
}
