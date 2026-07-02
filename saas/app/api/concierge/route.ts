// saas/app/api/concierge/route.ts
// Thin alias: the Concierge widget posts here; the brain lives in /api/support.
// CRITICAL: Next.js route segment config (maxDuration, dynamic) is read per
// route FILE and is NOT inherited through a re-export — without repeating it
// here, this route runs at Vercel's default (~15s) function timeout while the
// support brain it wraps budgets 240s for its model+tool loop. That mismatch
// silently killed any long request (e.g. campaign creation) at the platform
// level: non-JSON 504 → widget shows its generic fallback, no campaign row,
// no diagnostic. Keep these exports in sync with /api/support/route.ts.

import { NextRequest } from 'next/server'
import { POST as supportPost } from '@/app/api/support/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  return supportPost(req)
}
