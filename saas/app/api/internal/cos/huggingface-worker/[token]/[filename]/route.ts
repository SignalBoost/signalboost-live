import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { installHuggingFaceTrainingExecutorEnv } from '@/lib/ai/cos/cosUniversityHuggingFaceJobs'
import { trainingExecutorConfigFromEnv } from '@/lib/ai/cos/cosUniversityTrainingExecutor'
import {
  allowedHuggingFaceWorkerFilename,
  verifyHuggingFaceWorkerAccessToken,
} from '@/lib/ai/cos/cosUniversityHuggingFaceWorkerAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WORKER_PATHS: Readonly<Record<string, string>> = Object.freeze({
  'cos-university-hf-worker.py': path.join(process.cwd(), 'scripts', 'cos-university-hf-worker.py'),
  'cos-university-hf-worker-base.py': path.join(process.cwd(), 'scripts', 'cos-university-hf-worker-base.py'),
})

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string; filename: string }> },
) {
  installHuggingFaceTrainingExecutorEnv()
  const executor = trainingExecutorConfigFromEnv()
  const { token, filename } = await context.params
  if (!executor || !verifyHuggingFaceWorkerAccessToken({ token, secret: executor.secret })) {
    return NextResponse.json({ ok: false, error: 'huggingface_worker_access_denied' }, { status: 404 })
  }
  if (!allowedHuggingFaceWorkerFilename(filename)) {
    return NextResponse.json({ ok: false, error: 'huggingface_worker_not_found' }, { status: 404 })
  }
  try {
    const source = await readFile(WORKER_PATHS[filename], 'utf8')
    return new NextResponse(source, {
      status: 200,
      headers: {
        'content-type': 'text/x-python; charset=utf-8',
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'huggingface_worker_bundle_missing' }, { status: 500 })
  }
}
