import { NextRequest } from 'next/server'
import { POST as ttsPost } from '@/app/api/tts/route'

export async function POST(req: NextRequest) {
  return ttsPost(req)
}
