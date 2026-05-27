import { NextRequest } from 'next/server'
import { POST as videoSearchPost } from '@/app/api/video-search/route'

export async function POST(req: NextRequest) {
  return videoSearchPost(req)
}
