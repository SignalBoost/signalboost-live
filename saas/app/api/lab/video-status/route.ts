import { NextRequest } from 'next/server'
import { POST as videoStatusPost } from '@/app/api/video-status/route'

export async function POST(req: NextRequest) {
  return videoStatusPost(req)
}
