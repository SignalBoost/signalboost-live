// saas/portable-kernel/types.ts
// PORTABLE KERNEL — the contract every sellable module shares. Host-agnostic: no Next.js, no
// Supabase, no SDKs. A buyer who extracts any *-core also takes this kernel.
//
// It exists because three behaviours must be identical across every portable, or a buyer's
// deployment misbehaves in ways they cannot see:
//   1. The AI must know WHICH COMPANY IT WORKS FOR. An agent writing on a company's behalf
//      without knowing the company will invent one (see FACTUAL_DISCIPLINE).
//   2. It must never invent facts it was not given.
//   3. It may PREPARE work, but a human RELEASES it.
// Together these are the "chief of staff" function expressed portably: a buyer has no COS, but
// their AI behaves like one because the pattern ships inside the modules they bought.

// The facts an AI is permitted to state on its employer's behalf. Everything optional:
// whatever is missing becomes a visible placeholder, never an invention.
export interface CompanyFacts {
  legalName?: string
  brandName?: string
  website?: string
  products?: string[]
  boilerplate?: string
  spokespersonName?: string
  spokespersonTitle?: string
  approvedQuote?: string
  permittedClaims?: string[]
  forbiddenClaims?: string[]
}

// WHO THE AI WORKS FOR. A portable never assumes an employer — it asks the host. On the seller's
// platform this resolves from the platform's own organization record; a buyer implements it
// against THEIR company record, so installing a module connects it to their existing profile
// instead of making them retype it.
export interface CompanyProfilePort {
  load(): Promise<CompanyFacts | null>
}

// AGENT PREPARES, HUMAN RELEASES. Any agent-driven entry point (a chief-of-staff assistant, a
// browser agent, a scheduled job) returns this shape: work filled in and queued for approval,
// never executed. `awaitingApproval` is always true — an agent that could dispatch would be a
// parallel, ungoverned path around the approval queue.
export interface AgentPreparedWork {
  ok: boolean
  recordId?: string
  status?: string
  draft?: string
  placeholders?: string[]        // unfilled [FACTS] the generator refused to invent
  awaitingApproval: true
  error?: string
}
