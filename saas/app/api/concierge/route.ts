import { NextRequest } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'

export async function POST(req: NextRequest) {
  return supportPost(req)
}
