// saas/app/api/cos/status/route.ts
// COS lifeline / recognition probe. Tells the Assistant which brain the caller is
// actually getting so a silent downgrade to Concierge is never invisible again.
//   mode = 'cos'       -> recognized owner + AI key present  (full Chief of Staff)
//   mode = 'degraded'  -> recognized owner BUT ANTHROPIC_API_KEY missing (Concierge fallback)
//   mode = 'concierge' -> not recognized as owner (check OWNER_EMAILS)
// Owner recognition comes from the SAME resolver the support route uses (getAccess),
// so this badge reflects reality, not a guess.
import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  let isOwner = false
  try { const a = await getAccess(); isOwner = a.isOwner } catch { isOwner = false }
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)

  let mode: 'cos' | 'degraded' | 'concierge'
  let detail: string
  if (!isOwner) {
    mode = 'concierge'
    detail = 'Not recognized as owner — you are getting the customer Concierge, not your COS. Add your exact login email (lowercase) to OWNER_EMAILS in Vercel and redeploy.'
  } else if (!hasKey) {
    mode = 'degraded'
    detail = 'Owner recognized, but ANTHROPIC_API_KEY is missing in this deployment — the support route falls back to deterministic Concierge replies. Set the key and redeploy.'
  } else {
    mode = 'cos'
    detail = 'Full Chief of Staff active — owner recognized and AI configured.'
  }
  return NextResponse.json({ ok: true, mode, isOwner, detail })
}
