import { readBuilderRunLimits } from './inference-budget.ts'
import { isExplicitIsolatedProjectBuild } from './isolated-project-intent.ts'
import { wantsIsolatedPublication } from './isolated-publication.ts'
export type BuilderAdmissionBlocker = Readonly<{
  error: 'builder_inference_spend_cap_unavailable' | 'builder_budget_amount_invalid' | 'builder_isolated_publication_unavailable'
  status: 'incomplete'
  reply: string
  execution_allowed: false
  external_action_taken: false
}>

/** Call-count budgets and post-hoc usage records do not enforce a dollar ceiling. */
export function builderExecutionAdmissionBlocker(objective: string): BuilderAdmissionBlocker | null {
  // Budget support must not silently substitute a workspace-only result for requested Git/preview evidence.
  if (isExplicitIsolatedProjectBuild(objective) && wantsIsolatedPublication(objective)
    && !(process.env.BUILDER_ISOLATED_GITHUB_OWNER && process.env.GITHUB_WRITE_TOKEN
      && process.env.VERCEL_TOKEN && process.env.BUILDER_ISOLATED_VERCEL_PROJECT_ID)) {
    return { error: 'builder_isolated_publication_unavailable', status: 'incomplete',
      reply: 'INCOMPLETE: Builder V2 can enforce a per-run inference cap, but its isolated workspace lane cannot yet create and publish a Git repository, open its PR, or deploy a preview. No workspace-only run was substituted, and no job was started.',
      execution_allowed: false, external_action_taken: false }
  }
  try {
    if (readBuilderRunLimits(objective)) return null
  } catch {
    return { error: 'builder_budget_amount_invalid', status: 'incomplete',
      reply: 'INCOMPLETE: The requested per-run dollar cap or runtime limit is invalid. No Builder job was started.',
      execution_allowed: false, external_action_taken: false }
  }
  const lines = String(objective || '').split(/\r?\n/)
  const hardSpendLimit = lines.some(line => {
    const runLimit = /^\s*(?:limits?|budget|spend(?:ing)? (?:cap|limit))\s*:/i.test(line)
      || /\b(?:this (?:run|job|attempt)|inference (?:spend(?:ing)?|cost))\b/i.test(line)
    return runLimit && /(?:\$\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:USD|dollars?)\b)/i.test(line)
      && /\b(?:max(?:imum)?|at most|under|no more than|cap|limit|budget|ceiling)\b/i.test(line)
  })
  if (!hardSpendLimit) return null
  return {
    error: 'builder_inference_spend_cap_unavailable',
    status: 'incomplete',
    reply: 'INCOMPLETE: Builder cannot currently enforce the requested inference spending cap before each model call. Call-count and time limits do not guarantee a dollar limit. No Builder job or workspace was created, and no model call, repository change, or deployment was started.',
    execution_allowed: false,
    external_action_taken: false,
  }
}
