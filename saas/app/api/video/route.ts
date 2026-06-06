import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'SignalBoost Video API',
    version: '2.0.0',
    routes: [
      'POST /api/video/upload-url',
      'POST /api/video/transcribe',
      'GET  /api/video/transcribe?id=<transcriptId>',
      'POST /api/video/export',
      'GET  /api/video/jobs/[jobId]',
    ],
  })
}
