// saas/portable-kernel/approvals.ts
//
// AN APPROVAL BELONGS TO EXACTLY ONE PIPELINE, AND IT SAYS SO ON ITS FACE.
//
// PORTABLE KERNEL. Pure — no imports, no database, no network, no host.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// Approvals from different portables were landing in one undifferentiated queue. A press
// campaign, a video campaign, a social draft and a sales outreach draft all became rows that
// looked alike, and the owner had to work out which product each belonged to by reading it.
//
// That is the visible half. The half that matters is that the ROUTES did not check either:
// /api/marketing/press-print/decision loads a row by id and approves it without ever asking
// whether that row is a press row. A video campaign id posted to the press decision route was
// approved as a press campaign, and the cos campaign-queue approve path calls the auto-publish
// chain with no channel filter at all. Two pipelines that can act on each other's records are
// one pipeline wearing two names.
//
// So separation is enforced in code, not by convention:
//   · every approvable record DECLARES its kind when it is created;
//   · every approval route DECLARES the kind it is allowed to act on;
//   · assertApprovalKind() refuses the mismatch, with a message naming both sides.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A DISCRIMINATOR AND NOT ONE TABLE PER PORTABLE
//
// Separate physical tables are the tidier drawing. They are also a migration plus a rewrite of
// forty files that read the shared queue, during which BOTH shapes are live and the guarantee
// is weaker than it is today. The property the owner actually asked for — approvals from
// different portables cannot be confused with, or acted on by, each other — is delivered by a
// declared kind plus a refusal at every entry point, and it is delivered now rather than after
// a migration. If a buyer later wants physical separation, the kind is already the column to
// partition on: this is the step that makes that migration mechanical instead of archaeological.

/**
 * One entry per PORTABLE that owns an approval queue. Adding a portable means adding a kind —
 * deliberately, because a new approvable thing with no kind of its own is the defect this
 * module exists to prevent.
 */
export type ApprovalKind =
  | 'press_print'        // Press & Print Media — newspapers, magazines, trade press
  | 'press_media'        // Press & Media portable — wires, editorial submission
  | 'sales_outreach'     // cold sales email to companies
  | 'social_publishing'  // Social Outreach Connector — LinkedIn, X, Facebook…
  | 'video_campaign'     // COSA video / short-form
  | 'infrastructure'     // infra PRs, remediation, supervisor repairs

interface ApprovalKindProfile {
  /** Prefix that opens every reference. Short, uppercase, unambiguous when read aloud. */
  prefix: string
  /** What the owner sees on the approval card. */
  label: string
  /** Where this kind is reviewed, so a misrouted record can be pointed home rather than lost. */
  home: string
}

const APPROVAL_KINDS: Record<ApprovalKind, ApprovalKindProfile> = {
  press_print: { prefix: 'PP', label: 'Press & Print Media', home: '/dashboard/marketing/press-print' },
  press_media: { prefix: 'PM', label: 'Press & Media', home: '/dashboard/marketing/press-providers' },
  sales_outreach: { prefix: 'SO', label: 'Sales Outreach', home: '/dashboard/outreach' },
  social_publishing: { prefix: 'SP', label: 'Social Publishing', home: '/dashboard/outreach/social' },
  video_campaign: { prefix: 'VC', label: 'Video Campaign', home: '/dashboard/cosa' },
  infrastructure: { prefix: 'IN', label: 'Infrastructure', home: '/dashboard/supervisor/approvals' },
}

export function isApprovalKind(value: unknown): value is ApprovalKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(APPROVAL_KINDS, value)
}
export function approvalKindLabel(kind: ApprovalKind): string { return APPROVAL_KINDS[kind].label }
export function approvalKindHome(kind: ApprovalKind): string { return APPROVAL_KINDS[kind].home }

/** The three things an approval must carry: which pipeline, which record, and when. */
export interface ApprovalIdentity {
  kind: ApprovalKind
  /** Human-readable reference, e.g. PP-20260805-K7Q4M. Quotable in an email or on the phone. */
  ref: string
  /** ISO timestamp the approval was REQUESTED — not when it was decided. */
  requestedAt: string
}

// Crockford-style alphabet: no I, L, O or U, so a reference read aloud or retyped from a
// screenshot cannot become a different one. Five characters is ~33^5 ≈ 39M per kind per day,
// which is far past collision risk for a human approval queue.
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const REF_LENGTH = 5

function randomSuffix(random: () => number): string {
  let out = ''
  for (let i = 0; i < REF_LENGTH; i += 1) {
    out += REF_ALPHABET.charAt(Math.floor(random() * REF_ALPHABET.length) % REF_ALPHABET.length)
  }
  return out
}

function yyyymmdd(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '00000000'
  // UTC deliberately: an approval reference must mean the same thing to an owner in Mérida and
  // a reviewer in Warsaw. Local time would produce two different references for one record.
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}${month}${day}`
}

/**
 * Mint the identity a new approvable record carries for the rest of its life.
 *
 * `random` is injectable so a test can assert an exact reference; the host never passes it.
 */
export function mintApprovalIdentity(
  kind: ApprovalKind,
  requestedAt: string = new Date().toISOString(),
  random: () => number = Math.random,
): ApprovalIdentity {
  return {
    kind,
    ref: `${APPROVAL_KINDS[kind].prefix}-${yyyymmdd(requestedAt)}-${randomSuffix(random)}`,
    requestedAt,
  }
}

/** Read a reference back. Returns null for anything that is not one — never throws. */
export function parseApprovalRef(ref: string): { kind: ApprovalKind; date: string } | null {
  const match = /^([A-Z]{2})-(\d{8})-[0-9A-Z]{5}$/.exec(String(ref || '').trim().toUpperCase())
  if (!match) return null
  const entry = (Object.keys(APPROVAL_KINDS) as ApprovalKind[]).find(k => APPROVAL_KINDS[k].prefix === match[1])
  if (!entry) return null
  return { kind: entry, date: `${match[2].slice(0, 4)}-${match[2].slice(4, 6)}-${match[2].slice(6, 8)}` }
}

export interface ApprovalKindCheck {
  ok: boolean
  /** Present when ok is false: what to tell the caller, naming both pipelines. */
  error?: string
  /** Where the record actually belongs, so the refusal is a redirection rather than a dead end. */
  home?: string
}

/**
 * THE GATE. A route declares the kind it may act on; the record declares its own.
 *
 * `recordKind` is whatever was stored, which for records created before kinds existed is
 * nothing. A missing kind is NOT treated as a match — that would reopen the hole for exactly
 * the legacy rows most likely to be misfiled. The caller passes `legacyFallback` when it has
 * some other trustworthy evidence of the record's pipeline (for press-print, the outreach
 * channel), and the record is admitted only if THAT agrees.
 */
export function assertApprovalKind(
  expected: ApprovalKind,
  recordKind: unknown,
  legacyFallback?: boolean,
): ApprovalKindCheck {
  if (isApprovalKind(recordKind)) {
    if (recordKind === expected) return { ok: true }
    return {
      ok: false,
      error: `This record belongs to the ${approvalKindLabel(recordKind)} approval pipeline, not ${approvalKindLabel(expected)}. Approving it here would apply one product's rules to another product's record. Review it at ${approvalKindHome(recordKind)}.`,
      home: approvalKindHome(recordKind),
    }
  }
  if (legacyFallback === true) return { ok: true }
  return {
    ok: false,
    error: `This record does not declare which approval pipeline it belongs to, and nothing else identifies it as ${approvalKindLabel(expected)}. It cannot be approved here. Records created before approval kinds existed must be re-created, or rejected.`,
    home: approvalKindHome(expected),
  }
}
