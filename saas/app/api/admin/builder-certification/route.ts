// saas/app/api/admin/builder-certification/route.ts
//
// Runs the Builder certification ladder against the LIVE model, one case per request.
//
// WHY THIS ROUTE EXISTS.
//
// Every Builder capability is evidence-gated: promotion to wider repository work requires real
// Production observations at each ladder level, not scripted model decisions. Until now the only
// way to produce those observations was for a person to open Concierge and hand-drive three
// conversations, which makes the owner the test harness and makes acceptance rare enough that
// shipped work sits unproven. This route submits the same three cases through the same durable
// Builder job path an ordinary request uses, so acceptance is one call instead of three chats.
//
// WHAT IT DOES NOT DO. It scripts nothing. There is no fixture model, no canned trace, and no
// alternate execution lane — the objective goes to `enqueueBuilderJob` exactly as `/api/builder`
// sends one, the live `DEEPINFRA_BUILDER_MODEL` makes every tool decision, and the outcome is
// whatever `inferBuilderCertificationAttempt` reads out of the recorded tool evidence. A case
// that passes here passed because the live model actually did the work.
//
// ONE CASE PER REQUEST, deliberately. A Builder turn owns a real wall-clock budget; three in one
// request would exceed the route deadline and the first timeout would be indistinguishable from a
// capability failure. The caller runs level 1, reads the result, then runs level 2.
import { after, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { BUILDER_CERTIFICATION_CASES, type BuilderCertificationCaseId } from '@/lib/builder/certification'
import { BUILDER_CERTIFICATION_FIXTURES } from '@/lib/builder/certification-fixtures'
import { enqueueBuilderJob } from '@/lib/builder/job-store'
import { runBuilderJob } from '@/lib/builder/job-runner'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function noStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

const CASE_IDS = new Set(BUILDER_CERTIFICATION_CASES.map(entry => entry.id))

function isCertificationCaseId(value: unknown): value is BuilderCertificationCaseId {
  return typeof value === 'string' && CASE_IDS.has(value as BuilderCertificationCaseId)
}

/** Read-only standing: which levels this owner has actually earned, and what each case submits. */
export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return noStore({ error: guard.error }, { status: guard.status })

  const userId = guard.ctx.userId
  if (!userId) return noStore({ error: 'Not signed in.' }, { status: 401 })

  const workspace = createSupabaseBuilderWorkspace(userId)
  if (!workspace) return noStore({ error: 'Builder storage is unavailable.' }, { status: 503 })

  const summary = await workspace.certificationSummary().catch(error => ({
    error: error instanceof Error ? error.message : 'unknown',
  }))

  return noStore({
    ok: true,
    summary,
    cases: BUILDER_CERTIFICATION_CASES.map(entry => ({
      ...entry,
      objective: BUILDER_CERTIFICATION_FIXTURES[entry.id].objective,
      seededFiles: BUILDER_CERTIFICATION_FIXTURES[entry.id].seed.map(file => file.path),
    })),
    note: 'POST { caseId } runs one case against the live Builder model. Poll /api/builder?jobId= for the result.',
  })
}

export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return noStore({ error: guard.error }, { status: guard.status })

  const body = await request.json().catch(() => ({})) as { caseId?: unknown }
  if (!isCertificationCaseId(body.caseId)) {
    return noStore({
      error: 'builder_certification_case_required',
      cases: BUILDER_CERTIFICATION_CASES.map(entry => entry.id),
    }, { status: 400 })
  }

  const fixture = BUILDER_CERTIFICATION_FIXTURES[body.caseId]
  const userId = guard.ctx.userId
  if (!userId) return noStore({ error: 'Not signed in.' }, { status: 401 })

  const workspace = createSupabaseBuilderWorkspace(userId)
  if (!workspace) return noStore({ error: 'Builder storage is unavailable.' }, { status: 503 })

  // A fresh workspace per attempt. Reusing one would let a previous run's repaired file satisfy
  // the next attempt without the model doing anything, which would grade the fixture, not Builder.
  const workspaceId = crypto.randomUUID()
  const jobId = crypto.randomUUID()
  const conversationId = crypto.randomUUID()

  await workspace.ensureWorkspace(workspaceId)
  await workspace.setObjective(workspaceId, fixture.objective)
  for (const file of fixture.seed) await workspace.writeFile(workspaceId, file.path, file.content)

  await enqueueBuilderJob({
    jobId,
    workspaceId,
    userId,
    conversationId,
    objective: fixture.objective,
    jobKind: 'standard',
    metadata: { certificationCaseId: body.caseId },
    ownerAuthorized: true,
    runningReply: `Builder certification case ${body.caseId} is running as job ${jobId}.`,
  })

  after(async () => { await runBuilderJob(jobId, userId) })

  return noStore({
    ok: true,
    caseId: body.caseId,
    jobId,
    workspaceId,
    status: 'queued',
    poll: `/api/builder?jobId=${jobId}`,
  }, { status: 202 })
}
