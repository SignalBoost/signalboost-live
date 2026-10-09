// saas/app/api/lab/experiments/route.ts
//
// iTMounts Lab: start one experiment run on the University factory, and read the experiments a signed-in Lab member
// may start plus the status of runs already started.
//
// GET  -> { experiments, subjects (with eligible prepared batches), runs (status per started run) }
// POST { organizationId, experimentId, subjectId } -> starts one run (owner/admin of that Lab organization only).
//
// Authority: the Supabase session proves the user; explicit active Lab membership (lab.organization_members) proves the
// tenant; the start executes inside a customer HarnessRun. Nothing in the request body is authority. Starting is the
// spend decision for one training batch ($1.825 hard ceiling); canary and exam keep their own <=$0.20 ceilings.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'
import { createSupabaseLabExecutionDb, startLabExperimentUniversityRun, type VerifiedLabAuthority } from '@/lib/ai/cos/itmountsLabUniversityExecution'
import { withCustomerLabUniversityBindingHarness } from '@/platform-harness/adapters/lab-customer'
import { makeLabPhaseObservation } from '@/lib/ai/cos/labAllPhasesObservability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const START_ROLES = new Set(['owner', 'admin'])

async function signedInUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: saasSupabaseCookieOptions,
    cookies: { get: name => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  })
  const { data: { user } } = await auth.auth.getUser()
  return user?.id ?? null
}

export async function GET() {
  const userId = await signedInUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const service = cosServiceDb()
  if (!service) return NextResponse.json({ ok: false, error: 'lab_service_unavailable' }, { status: 503 })
  const { data, error } = await service.rpc('itmounts_lab_experiment_start_options', { p_user_id: userId })
  if (error) return NextResponse.json({ ok: false, error: 'lab_options_unavailable' }, { status: 503 })
  const options = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  return NextResponse.json({
    ok: true,
    experiments: Array.isArray(options.experiments) ? options.experiments : [],
    subjects: Array.isArray(options.subjects) ? options.subjects : [],
    runs: Array.isArray(options.runs) ? options.runs : [],
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const userId = await signedInUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const organizationId = String(body?.organizationId ?? '').trim()
  const experimentId = String(body?.experimentId ?? '').trim()
  const subjectId = String(body?.subjectId ?? '').trim()
  if (![organizationId, experimentId].every(value => UUID.test(value)) || !subjectId || subjectId.length > 200) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }
  const service = cosServiceDb()
  if (!service) return NextResponse.json({ ok: false, error: 'lab_service_unavailable' }, { status: 503 })
  const { data: membership, error } = await service.rpc('itmounts_lab_resolve_user_organization', { p_user_id: userId, p_organization_id: organizationId })
  if (error) return NextResponse.json({ ok: false, error: 'lab_membership_unavailable' }, { status: 503 })
  const member = membership as null | { organization_id?: string; status?: string; role?: string }
  if (!member || member.organization_id !== organizationId || member.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'lab_tenant_forbidden' }, { status: 403 })
  }
  if (!START_ROLES.has(String(member.role))) return NextResponse.json({ ok: false, error: 'lab_start_requires_owner_or_admin' }, { status: 403 })

  try {
    const result = await withCustomerLabUniversityBindingHarness({
      organizationId,
      objective: 'Start one authenticated customer Lab Experiment run on the governed University factory.',
      operation: async manifest => {
        const authority: VerifiedLabAuthority = {
          verifiedByHarness: true,
          organizationId,
          harnessRunId: manifest.runId,
          capability: 'university.distillation.execute',
          authorityExpanded: false,
        }
        return startLabExperimentUniversityRun({
          authority,
          experimentId,
          subjectId,
          startedBy: userId,
          db: createSupabaseLabExecutionDb({ rpc: async (name, args) => { const { data, error } = await service.rpc(name, args); return { data, error } } }),
        })
      },
    })
    // Record an observed start only after the governed Lab factory accepts the run.
    // A start is NOT a finished experiment, passed evaluation, or independent certification.
    if (result.ok) {
      const revision = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
      if (revision && /^[a-f0-9]{7,64}$/i.test(revision)) {
        const event = makeLabPhaseObservation({
          phase: 1, signal: 'factory_execution', source: 'live_runtime', outcome: 'started',
          exactRevision: revision, observedAt: new Date().toISOString(),
        })
        try {
          const { error: observationError } = await service.from('lab_phase_observations').insert({
            tenant_id: organizationId, phase: event.phase, signal: event.signal,
            source: event.source, outcome: event.outcome,
            exact_revision: event.exactRevision, observed_at: event.observedAt,
          })
          // Telemetry must not roll back an already-authorized customer experiment.
          if (observationError) console.error('[lab_phase_observation_delivery_failed]', { phase: 1 })
        } catch {
          console.error('[lab_phase_observation_delivery_failed]', { phase: 1 })
        }
      } else console.error('[lab_phase_observation_revision_unavailable]', { phase: 1 })
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 409 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'lab_execution_failed'
    const status = /tenant|authority|harness_denied/.test(message) ? 403 : /missing/.test(message) ? 404 : 409
    return NextResponse.json({ ok: false, error: message.slice(0, 200) }, { status })
  }
}
// end of saas/app/api/lab/experiments/route.ts (if this line is missing, the paste was cut short)
