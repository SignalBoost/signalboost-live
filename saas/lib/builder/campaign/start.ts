// saas/lib/builder/campaign/start.ts
//
// STARTING A VERIFICATION CAMPAIGN. Admitted by COS's planner (the model reads the request and asks for the
// verification_campaign capability; no word rule) for the signed-in owner on the Assistant surface. The job is an
// ordinary durable Builder job with engine 'campaign': it runs in slices, resumes through the continuation cron,
// and reports its evidence package to History. It never edits a workspace or a repository.

import { after } from 'next/server'
import { enqueueBuilderJob } from '../job-store.ts'
import { runBuilderJob } from '../job-runner.ts'
import { createSupabaseBuilderWorkspace } from '../workspace-supabase.ts'
import { PAC_CAMPAIGN_ID, PAC_CATALOG, isTargetedRun, selectCampaignChecks } from './catalog.ts'
import { CAMPAIGN_ENGINE } from './job.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function campaignRunningReply(checks: readonly unknown[] | null = null): string {
  const catalog = selectCampaignChecks(checks)
  if (isTargetedRun(catalog)) {
    return `Running ${catalog.map(item => item.id).join(', ')} of ${PAC_CAMPAIGN_ID} against the live site in the background (${catalog.length} of ${PAC_CATALOG.length} checks). Each result appears as soon as it is recorded; this is a retest of the named checks, not a certification.`
  }
  return `Verification campaign ${PAC_CAMPAIGN_ID} started: ${PAC_CATALOG.length} checks against the live site, each with its own evidence. It runs in the background: checks that do not use the model report within seconds, every failure appears as soon as it is recorded, and the evidence package and the certification outcome will appear here when it finishes.`
}

export async function startVerificationCampaign(input: Readonly<{
  userId: string
  conversationId: string | null
  objective: string
  responseLanguage?: string | null
  /** The check ids the planner read from the owner's request; empty runs the whole campaign. */
  checks?: readonly string[] | null
}>): Promise<Readonly<{ jobId: string; conversationId: string; reply: string; checks: readonly string[] }>> {
  if (!UUID.test(input.userId)) throw new Error('builder_campaign_owner_required')
  const workspace = createSupabaseBuilderWorkspace(input.userId)
  if (!workspace) throw new Error('builder_campaign_workspace_unavailable')
  const jobId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  const conversationId = input.conversationId && UUID.test(input.conversationId) ? input.conversationId : crypto.randomUUID()
  await workspace.ensureWorkspace(workspaceId)
  const catalog = selectCampaignChecks(input.checks)
  const checks = isTargetedRun(catalog) ? catalog.map(item => item.id) : []
  const reply = `${campaignRunningReply(checks)}\n\nJob ID: ${jobId}. Status: queued (execution is not yet verified).`
  await enqueueBuilderJob({
    jobId, workspaceId, userId: input.userId, conversationId,
    objective: String(input.objective || '').trim().slice(0, 4_000) || `Run the production acceptance campaign ${PAC_CAMPAIGN_ID}.`,
    jobKind: 'standard',
    metadata: { builderEngine: CAMPAIGN_ENGINE, campaignId: PAC_CAMPAIGN_ID, ...(checks.length ? { campaignChecks: checks } : {}), ...(input.responseLanguage ? { responseLanguage: input.responseLanguage } : {}) },
    ownerAuthorized: true,
    runningReply: reply,
  })
  after(async () => { await runBuilderJob(jobId, input.userId) })
  return { jobId, conversationId, reply, checks }
}
