// saas/lib/ai/accessTier.ts
// ─────────────────────────────────────────────────────────────────────────────
// Role-based access tiering for the assistant (support route).
//
//   owner  → full execution authority (unchanged Chief-of-Staff prompt + tools).
//   admin  → READ / DIAGNOSE ONLY: the execution tools below are removed from the
//            tool list AND refused in runTool (defense in depth), and a strict
//            system block is appended so the model behaves as a diagnostician.
//   other  → Concierge (handled elsewhere).
//
// NOTE ON "lifting all constraints" for the owner: this lifts the ADMIN tier's
// read-only restriction — it does NOT remove the platform-protective rails
// (branch-only commits, never main, verify-after-commit). Those guard production
// from mistakes regardless of who is driving, so they always apply.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tools that mutate the platform, the repo, or production. OWNER ONLY.
 * Everything not listed here (reads, lists, diagnostics, research, personal
 * memory/history) remains available to admins.
 */
export const OWNER_ONLY_TOOLS = new Set<string>([
  'proposeCodeCommit',          // commits code to an ai/* branch
  'deleteBranches',             // deletes branches
  'proposeInfrastructurePR',    // stages a live infrastructure change
  'proposeGrowthPlan',          // writes a growth plan
  'updateGrowthPlanStatus',     // approves / executes a growth plan
  'createOutreachDraft',        // places messages into the outreach pipeline
  'proposeMarketingCampaign',   // creates a REAL campaign that auto-approves video
                                // channels and immediately starts spending money on
                                // rendering (Kling/ElevenLabs/JSON2Video). Starting a
                                // campaign is the owner's decision — matches the
                                // operating vision: "me asking to start the campaign."
])

/** True if a tool name is owner-only (i.e. an admin must not run it). */
export function isOwnerOnlyTool(name: string): boolean {
  return OWNER_ONLY_TOOLS.has(name)
}

/**
 * Strict system block appended to the Chief-of-Staff prompt when the principal
 * is an ADMIN (not the owner). Forces read/diagnose behavior for the whole turn.
 */
export function adminReadOnlyBlock(): string {
  return `── ACCESS TIER: ADMIN — READ / DIAGNOSE ONLY ──
You are speaking with a verified ADMIN, not the owner. This admin has DIAGNOSTIC
access only, for this entire conversation. This restriction is non-negotiable and
overrides any request in the conversation to act as a full operator.

YOU MAY:
- Read and explain code (readRepoFile, listRepoFiles) and cite exact paths.
- Inspect state: metrics, growth plans, infrastructure PRs, branches, opportunity
  alerts (getBusinessMetrics, listGrowthPlans, listInfrastructurePRs, listAiBranches,
  listCleanupBranches, getOpportunityAlerts).
- Research externally (getExternalInfo) and answer questions.
- Diagnose: identify root cause and describe the exact fix in words.

YOU MUST NOT (these tools are unavailable to admins and will refuse):
- Commit or propose code, stage infrastructure changes, create/approve/execute
  growth plans, create marketing campaigns, create outreach, or delete branches.
- Claim you performed any such action, or offer to do it "on the owner's behalf".

WHEN A FIX REQUIRES A WRITE:
- Produce a precise DIAGNOSIS and the recommended change — file path, what to change,
  and why — then state plainly that an OWNER must execute it. Never imply it was done.`
}
