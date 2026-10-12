import { observeLabRequest } from '@/lib/lab/observability'
// saas/app/api/lab/training/download/route.ts
// GET ?organizationId=&runId=            -> the trained model's file list (any active member)
// GET ?organizationId=&runId=&path=...   -> streams that file
//
// The model sits in the customer's private Hugging Face repository. A LAB member usually has no access to it, so this
// server streams each file using the organization's stored Hugging Face key (released by the database only for an
// active member and a completed run), at the pinned revision, and verifies size + hash against the manifest recorded
// when training finished. The key never leaves the server. Graduation/certification is never checked.
import { NextRequest, NextResponse } from 'next/server'
import { customerSession, rpcErrorCode, UUID_RE } from '@/lib/lab/customerSession'
import { openCustomerCredential } from '@/lib/ai/cos/labCustomerCredentialVault'
import { decideModelDownload, verifyingStream } from '@/lib/ai/cos/labCustomerTraining'
import { openArtifactFile } from '@/lib/ai/cos/labCustomerHfPorts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function getHandler(req: NextRequest) {
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const organizationId = req.nextUrl.searchParams.get('organizationId') || ''
  const runId = req.nextUrl.searchParams.get('runId') || ''
  const path = req.nextUrl.searchParams.get('path')
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(runId)) return NextResponse.json({ ok: false, error: 'lab_download_request_invalid' }, { status: 400 })

  const { data: opened, error } = await session.supabase.rpc('itmounts_lab_customer_open_run_download', { p_organization_id: organizationId, p_run_id: runId })
  if (error || !opened) {
    const code = rpcErrorCode(error)
    return NextResponse.json({ ok: false, error: code }, { status: code === 'lab_customer_artifact_not_ready' ? 409 : 403 })
  }
  const run = { stage: 'completed', artifactRepo: opened.artifactRepo, artifactRevision: opened.artifactRevision, artifactFiles: opened.artifactFiles }
  if (path === null) {
    return NextResponse.json({ ok: true, revision: opened.artifactRevision, files: (opened.artifactFiles ?? []).map((f: any) => ({ path: f.path, size: f.size })) }, { headers: { 'cache-control': 'no-store' } })
  }
  const decision = decideModelDownload({ activeMember: true, run, path })
  if (decision.allowed === false) return NextResponse.json({ ok: false, error: decision.reason }, { status: 404 })
  try {
    const token = openCustomerCredential({ organizationId, credentialId: opened.compute.id, sealed: opened.compute })
    const upstream = await openArtifactFile({ repo: decision.repo, revision: decision.revision, path: decision.file.path, token })
    const name = decision.file.path.split('/').pop() || 'model-file'
    return new NextResponse(upstream.body!.pipeThrough(verifyingStream(decision.file)), {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(decision.file.size),
        'content-disposition': `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (caught) {
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message.split(':')[0] : 'lab_download_failed' }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  return observeLabRequest('artifact.download', () => getHandler(req))
}
