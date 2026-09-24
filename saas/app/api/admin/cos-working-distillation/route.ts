import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import {
  dispatchWorkingCosDatasetPreparation,
  dispatchWorkingCosTraining,
  workingCosDispatchReadiness,
} from '@/lib/ai/cos/cosWorkingDistillationDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

function errorStatus(message: string): number {
  if (message === 'training_executor_dispatch_disabled'
    || message === 'working_cos_dispatch_disabled'
    || message === 'working_cos_training_provider_not_configured') return 503
  if (message.includes('explicit_confirmation_required')
    || message.startsWith('working_cos_')
    || message.startsWith('huggingface_')) return 400
  return 500
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status, headers: NO_STORE })
  }

  try {
    const readiness = await workingCosDispatchReadiness()
    return NextResponse.json({ ok: true, readOnly: true, ...readiness }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message), headers: NO_STORE })
  }
}

export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status, headers: NO_STORE })
  }

  let body: any = null
  try { body = await request.json() } catch { body = null }
  const operation = String(body?.operation || '').trim()

  try {
    if (operation === 'prepare_dataset') {
      const result = await dispatchWorkingCosDatasetPreparation({
        confirmDispatch: body?.confirmDispatch,
        rotationSeed: typeof body?.rotationSeed === 'string' ? body.rotationSeed : undefined,
      })
      return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE })
    }

    if (operation === 'train') {
      const result = await dispatchWorkingCosTraining({
        confirmDispatch: body?.confirmDispatch,
        rotationSeed: typeof body?.rotationSeed === 'string' ? body.rotationSeed : undefined,
      })
      return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE })
    }

    return NextResponse.json(
      { ok: false, error: 'working_cos_operation_invalid', allowed: ['prepare_dataset', 'train'] },
      { status: 400, headers: NO_STORE },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message), headers: NO_STORE })
  }
}
