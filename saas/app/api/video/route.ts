import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      service: 'video',
      status: 'ready',
      message:
        'Video API is available. Use /api/video/upload, /api/video/captions, /api/video/export, and /api/video/transcribe for video actions.',
    },
    error: null,
    meta: { generatedAt: new Date().toISOString() },
  })
}
