import { NextRequest } from 'next/server'
import { POST as videoGeneratePost } from '@/app/api/video-generate/route'

export async function POST(req: NextRequest) {
  return videoGeneratePost(req)
}
