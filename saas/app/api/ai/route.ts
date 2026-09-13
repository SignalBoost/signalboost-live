import { NextRequest } from 'next/server'
import { POST as cosBrowserPost } from '@/app/api/cos-browser/route'

// Legacy /api/ai callers now enter the same governed, provider-independent browser ingress as
// Concierge and the owner Assistant. Do not bypass COS routing through /api/support.
export async function POST(req: NextRequest) {
  return cosBrowserPost(req)
}
