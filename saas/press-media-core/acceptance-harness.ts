// saas/press-media-core/acceptance-harness.ts
//
// Proof, in the buyer's own environment, against the buyer's own ports, that
// this portable behaves before it is pointed at a journalist.
//
// The risk here is not operational, it is reputational: a fabricated product
// name or an invented quote goes out under the buyer's name to a real editor,
// and no rollback exists for that. This portable has already produced exactly
// that failure once. So the checks below are written against the specific ways
// it can embarrass a buyer, not against a generic happy path.
//
// SAFETY: this harness sends ONE REAL EMAIL, to an address the caller supplies
// and controls. It will not run without that address, and it never reads a
// target from a media database. The send is real because a stubbed transport
// would prove nothing about whether the buyer's mail actually leaves.
//
// It never throws. An unexpected error becomes a failed check, because a
// harness that explodes tells the buyer less than one that reports.

import type {
  CampaignBrief,
  MediaCampaign,
  MediaProviderAdapter,
  MediaTarget,
  PortBundle,
} from './types.ts';
import { findPlaceholders } from './rules.ts';
// Imported from the concrete modules, not from the barrel: the barrel re-exports
// this file, and a cycle through it would be a fragile way to reach a registry.
import { createRegistry, type MediaProviderRegistry } from './registry.ts';
import { createFreeSubmissionAdapter } from './adapters/free-submission.ts';

export type PressCheckId =
  | 'provider_registered'
  | 'buyer_identity_used'
  | 'unverified_target_refused'
  | 'invalid_contact_refused'
  | 'generation_used_buyer_ai'
  | 'forbidden_claim_absent'
  | 'unapproved_quote_absent'
  | 'dispatch_delivered'
  | 'owner_notified'
  | 'proof_not_fabricated'
  | 'audit_sink_reachable';

export interface PressCheck {
  id: PressCheckId;
  passed: boolean;
  detail: string;
}

export interface PressAcceptanceResult {
  schema: 'press-media-acceptance/1';
  providerId: string;
  passed: boolean;
  checks: PressCheck[];
  creativeLength: number;
  placeholdersFound: string[];
  ranAt: string;
  summary: string;
}

export interface PressAcceptanceOptions {
  /** The buyer's own wired ports. Not a fixture. */
  ports: PortBundle;
  /**
   * An address the CALLER CONTROLS. The dispatch check sends a real message
   * here. Never point this at a journalist or a real publication.
   */
  selfAddress: string;
  /** Defaults to the registry the portable ships with. */
  registry?: MediaProviderRegistry;
  /** Defaults to the free reference adapter. */
  providerId?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// A quote attributed to a person, which rule 3 forbids unless an approved quote
// was supplied. Matches "…," said Name / Name said, "…" in either order.
const ATTRIBUTED_QUOTE_RE = /["“][^"”]{15,}["”]\s*,?\s*(said|says|added|noted)\b|(said|says|added|noted)\s+[A-Z][a-z]+[^.]{0,40}["“]/i;

function check(id: PressCheckId, passed: boolean, detail: string): PressCheck {
  return Object.freeze({ id, passed, detail });
}

function summarize(result: Omit<PressAcceptanceResult, 'summary'>): string {
  const lines: string[] = [];
  lines.push(`Press & Media acceptance — ${result.providerId} — ${result.passed ? 'PASS' : 'FAIL'}`);
  for (const c of result.checks) {
    lines.push(`  ${c.passed ? 'pass' : 'FAIL'}  ${c.id}: ${c.detail}`);
  }
  if (result.placeholdersFound.length) {
    lines.push(`  placeholders left for a human to fill: ${result.placeholdersFound.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Runs the scenario and returns a frozen, JSON-serializable record. Keep it —
 * it is the acceptance evidence for this deployment.
 */
export async function runPressAcceptance(options: PressAcceptanceOptions): Promise<PressAcceptanceResult> {
  const providerId = options.providerId || 'free_submission';
  const checks: PressCheck[] = [];
  let creative = '';
  let placeholders: string[] = [];

  const finish = (): PressAcceptanceResult => {
    const base = {
      schema: 'press-media-acceptance/1' as const,
      providerId,
      passed: checks.every((c) => c.passed),
      checks: Object.freeze(checks.slice()) as PressCheck[],
      creativeLength: creative.length,
      placeholdersFound: Object.freeze(placeholders.slice()) as string[],
      ranAt: new Date().toISOString(),
    };
    return Object.freeze({ ...base, summary: summarize(base) });
  };

  const address = String(options.selfAddress || '').trim();
  if (!EMAIL_RE.test(address)) {
    checks.push(
      check(
        'dispatch_delivered',
        false,
        'No valid selfAddress was supplied. Acceptance sends a real message and will not guess a recipient.',
      ),
    );
    return finish();
  }

  const registry = options.registry || createRegistry(createFreeSubmissionAdapter());
  let adapter: MediaProviderAdapter | null = null;
  try {
    adapter = registry.get(providerId) || null;
  } catch {
    adapter = null;
  }
  if (!adapter) {
    checks.push(
      check('provider_registered', false, `"${providerId}" is not registered. Register its adapter before acceptance.`),
    );
    return finish();
  }
  const descriptor = adapter.describe();
  checks.push(
    check('provider_registered', true, `${descriptor.label} (${descriptor.type}, cost ${descriptor.cost}, proof ${descriptor.proof}).`),
  );

  // ---------------------------------------------------------------- identity

  let facts = null as Awaited<ReturnType<NonNullable<PortBundle['company']>['load']>> | null;
  if (!options.ports.company) {
    checks.push(
      check(
        'buyer_identity_used',
        false,
        'No CompanyProfilePort is wired, so the engine does not know whose company it writes for. Every company detail would be a visible placeholder.',
      ),
    );
  } else {
    try {
      facts = await options.ports.company.load();
      const named = facts && (facts.brandName || facts.legalName);
      checks.push(
        check(
          'buyer_identity_used',
          Boolean(named),
          named
            ? `Identity resolved to "${facts.brandName || facts.legalName}"${facts.products?.length ? ` with ${facts.products.length} approved product name(s)` : ' with no approved product names — those will be placeholders'}.`
            : 'CompanyProfilePort returned no company name. Generated copy will carry placeholders instead of your brand.',
        ),
      );
    } catch (err) {
      checks.push(check('buyer_identity_used', false, `CompanyProfilePort threw: ${(err as Error).message}`));
    }
  }

  // ------------------------------------------------------- target validation

  const emptyTarget: MediaTarget = { mediaTargetType: 'digital_press' };
  try {
    const verdict = await adapter.validateTarget(emptyTarget, options.ports);
    checks.push(
      check(
        'unverified_target_refused',
        verdict.ok === false,
        verdict.ok === false
          ? `Refused a target with no contact: ${verdict.reason}`
          : 'A target with NO editor contact was accepted. The portable must never dispatch to an invented contact.',
      ),
    );
  } catch (err) {
    checks.push(check('unverified_target_refused', false, `validateTarget threw: ${(err as Error).message}`));
  }

  try {
    const verdict = await adapter.validateTarget(
      { mediaTargetType: 'digital_press', editorEmail: 'not-an-address' },
      options.ports,
    );
    checks.push(
      check(
        'invalid_contact_refused',
        verdict.ok === false,
        verdict.ok === false ? `Refused a malformed contact: ${verdict.reason}` : 'A malformed editor address was accepted.',
      ),
    );
  } catch (err) {
    checks.push(check('invalid_contact_refused', false, `validateTarget threw: ${(err as Error).message}`));
  }

  // ------------------------------------------------------------- generation

  const brief: CampaignBrief = {
    goal:
      'Acceptance check for this deployment. Announce the company to trade press using only facts the deployment supplied.',
    audience: 'trade press editors',
    language: 'en',
  };

  let aiCalled = false;
  const observingPorts: PortBundle = {
    ...options.ports,
    ai: {
      async generate(b, spec) {
        aiCalled = true;
        return options.ports.ai.generate(b, spec);
      },
    },
  };

  try {
    const generated = await adapter.generate(brief, observingPorts);
    creative = String(generated?.creative || '');
    placeholders = findPlaceholders(creative);
    checks.push(
      check(
        'generation_used_buyer_ai',
        aiCalled && creative.length > 0,
        aiCalled
          ? creative.length > 0
            ? `Your AiPort produced ${creative.length} characters.`
            : 'Your AiPort was called but returned nothing.'
          : 'Generation did not reach your AiPort.',
      ),
    );
  } catch (err) {
    checks.push(check('generation_used_buyer_ai', false, `generate threw: ${(err as Error).message}`));
  }

  // Forbidden claims are exact strings the deployment declared off-limits, so
  // this check is deterministic rather than a judgement about tone.
  const forbidden = (facts?.forbiddenClaims || []).filter((c) => c && c.trim());
  if (!forbidden.length) {
    checks.push(
      check(
        'forbidden_claim_absent',
        true,
        'No forbidden claims are declared, so there was nothing to violate. Declaring some makes this check meaningful.',
      ),
    );
  } else {
    const hit = forbidden.find((c) => creative.toLowerCase().includes(c.toLowerCase()));
    checks.push(
      check(
        'forbidden_claim_absent',
        !hit,
        hit ? `Generated copy contains a declared forbidden claim: "${hit}".` : `None of the ${forbidden.length} forbidden claim(s) appear in the copy.`,
      ),
    );
  }

  // Rule 3: with no approved quote supplied, the copy must carry no attributed
  // quote at all — not even a plausible-sounding one.
  const hasApprovedQuote = Boolean(facts?.approvedQuote && facts.approvedQuote.trim());
  if (hasApprovedQuote) {
    // Compared without terminal punctuation: a release conventionally writes
    // `"…," said X`, turning the quote's full stop into a comma. Requiring a
    // byte-exact match would fail correct verbatim use, which would teach a
    // buyer to ignore this check.
    const quoteCore = facts.approvedQuote.trim().replace(/[.!?,;:\s]+$/, '');
    const usedVerbatim = quoteCore.length > 0 && creative.includes(quoteCore);
    checks.push(
      check(
        'unapproved_quote_absent',
        usedVerbatim || !ATTRIBUTED_QUOTE_RE.test(creative),
        usedVerbatim
          ? 'The approved quote was used verbatim.'
          : 'An attributed quote appears that is not the approved quote.',
      ),
    );
  } else {
    const invented = ATTRIBUTED_QUOTE_RE.test(creative);
    checks.push(
      check(
        'unapproved_quote_absent',
        !invented,
        invented
          ? 'Copy contains a quote attributed to a person, but no approved quote was supplied. That sentence was invented.'
          : 'No quote was invented, and none was supplied.',
      ),
    );
  }

  // --------------------------------------------------------------- dispatch

  const campaign: MediaCampaign = {
    id: `acceptance-${Date.now()}`,
    providerId,
    target: { mediaTargetType: 'digital_press', publicationName: 'Acceptance check', editorEmail: address },
    creative: creative || 'Acceptance check — no creative was generated.',
    brief,
  };

  let deliveredTo = '';
  let notifiedStage = '';
  const dispatchPorts: PortBundle = {
    ...options.ports,
    email: {
      async send(input) {
        // Deliver FIRST, record only on success. Recording before awaiting the
        // buyer's transport is how a harness reports a delivery that never
        // happened — the exact false pass this project has already built once.
        const sent = await options.ports.email.send(input);
        if (sent?.ok) deliveredTo = input.to;
        return sent;
      },
    },
    notify: {
      async notifyOwner(stage, c, proof) {
        await options.ports.notify.notifyOwner(stage, c, proof);
        notifiedStage = stage;
      },
    },
  };

  try {
    const result = await adapter.dispatch(campaign, dispatchPorts);
    const ok = deliveredTo === address && result.state !== 'failed';
    checks.push(
      check(
        'dispatch_delivered',
        ok,
        ok
          ? `Your EmailPort accepted a real message to ${address} (state: ${result.state}).`
          : deliveredTo
            ? `Delivered to ${deliveredTo}, which is not the address supplied.`
            : `Your EmailPort did not accept the message. ${result.detail || ''}`.trim(),
      ),
    );
  } catch (err) {
    checks.push(check('dispatch_delivered', false, `dispatch threw: ${(err as Error).message}`));
  }

  checks.push(
    check(
      'owner_notified',
      Boolean(notifiedStage),
      notifiedStage
        ? `Your OwnerNotifyPort was reached with stage "${notifiedStage}".`
        : 'Your OwnerNotifyPort was never reached, so a dispatch would happen with nobody told.',
    ),
  );

  // ------------------------------------------------------------------ proof

  try {
    const proof = await adapter.fetchProof(`acceptance:${campaign.id}`, options.ports);
    const serialized = JSON.stringify(proof?.payload ?? null);
    const fabricated = /https?:\/\//i.test(serialized);
    checks.push(
      check(
        'proof_not_fabricated',
        proof.pending === true && !fabricated,
        fabricated
          ? 'A URL was returned as proof before any publication was confirmed. Proof must stay pending until a human records the real link.'
          : proof.pending === true
            ? 'Proof correctly stayed pending — no publication URL was invented.'
            : `Proof reported not-pending (${proof.proofType}) without a confirmed publication.`,
      ),
    );
  } catch (err) {
    checks.push(check('proof_not_fabricated', false, `fetchProof threw: ${(err as Error).message}`));
  }

  // ------------------------------------------------------------------ audit

  if (!options.ports.audit) {
    checks.push(
      check(
        'audit_sink_reachable',
        true,
        'No audit sink is wired, which is a supported configuration. Wire one if your security team expects press dispatches in the SIEM.',
      ),
    );
  } else {
    try {
      await options.ports.audit.record({
        eventId: `acceptance-${campaign.id}`,
        eventType: 'press.acceptance_check',
        occurredAt: new Date().toISOString(),
        dataset: 'press_media',
        subjectId: campaign.id,
        payload: { providerId, check: 'acceptance-harness' },
      });
      checks.push(
        check(
          'audit_sink_reachable',
          true,
          'Your audit sink accepted an event. This proves the sink works, not that every dispatch emits one.',
        ),
      );
    } catch (err) {
      checks.push(check('audit_sink_reachable', false, `Your audit sink threw: ${(err as Error).message}`));
    }
  }

  return finish();
}
