import { NextRequest } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'

// Concierge is only the entry point. The canonical owner/customer brain,
// memory, tools, permissions, and governed action selection live in /api/support.
// Do not add keyword routers, canned replies, or direct side effects here.
export async function POST(req: NextRequest) {
  return supportPost(req)
}
