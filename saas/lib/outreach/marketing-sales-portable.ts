// saas/lib/outreach/marketing-sales-portable.ts
//
// MARKETING + SALES — the combined portable's public surface.
//
// The owner's decision, and the reason this file exists: social media is not a separate
// discipline from marketing and sales any more, so Marketing + Sales must ship WITH the
// social connectors rather than beside them. The Social Outreach Connector remains
// sellable on its own — a buyer who only wants publishing installs that smaller
// package — but Marketing + Sales is never sold without it.
//
// So there are two artifacts from one codebase:
//
//   social-portable.ts          → Social Outreach Connector (publishing only)
//   marketing-sales-portable.ts → Marketing + Sales (email outreach + publishing)
//
// This barrel re-exports the whole social surface and adds the email side. The packager
// (saas/scripts/build-marketing-sales-portable.mjs) walks the graph from here and fails
// on any host import, so this file is the boundary as well as the API.
//
// WHAT IS DELIBERATELY NOT HERE: the campaign lifecycle shell in marketing-sales-core,
// the prospect discovery worker, and every API route. Those are host concerns — the
// shell needs a scheduler, the worker needs a job table, and routes need the host's
// authentication. A buyer wires their own; the portable supplies the behaviour those
// things orchestrate, which is the part that is hard to write and easy to get wrong.

// ── Social publishing ────────────────────────────────────────────────────────
// The entire Social Outreach Connector, unchanged. A buyer who later buys only the
// connector gets exactly these symbols from the smaller package.
export * from './social-portable.ts'

// ── Email composition ────────────────────────────────────────────────────────
// The closing block every outbound message carries: team signature, contact address,
// platform link — always at the end, applied at SEND time so messages approved before
// a rule existed still receive it. Idempotent.
export {
  applyOutreachSignature,
  applyOutreachLink,
  outreachTeamName,
  outreachContactAddress,
  outreachLink,
} from './signature.ts'

// ── Duplicate protection ─────────────────────────────────────────────────────
// Scoped to the PRODUCT, not the address: the same company may be approached again for
// a different offer, never twice for the same one. A prospect list is an asset reused
// across products, and burning an address after one campaign is the wrong trade.
export {
  getRecipientHistory,
  duplicateReason,
  normalizeAddress,
  productKeyOf,
  type RecipientHistory,
} from './recipientHistory.ts'

// ── Recipient discovery ──────────────────────────────────────────────────────
// Finds a REAL published address on the target's own site. Returns nothing rather than
// guessing — the rule that keeps this from becoming a spam tool.
export { findContactEmail, type ContactEmailResult } from './emailFinder.ts'

// ── Language ─────────────────────────────────────────────────────────────────
// Which language to write in, decided from the TARGET's identity, never from the
// operator's interface language. A US prospect gets English while the console is in
// Portuguese, and that is correct.
export { pickOutreachLanguage, type OutreachLang } from './regionLanguage.ts'
