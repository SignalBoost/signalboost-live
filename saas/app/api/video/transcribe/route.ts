import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /api/video
 * Health check / version endpoint for the Video Studio API.
 * Transcription  → POST /api/video/transcribe  (submit) + GET /api/video/transcribe?id=...  (poll)
 * Signed upload  → POST /api/video/upload-url
 * Export jobs    → POST /api/video/export
 * Job status     → GET  /api/video/jobs/[jobId]
 */
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
