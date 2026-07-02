// saas/app/api/whoami/route.ts
// Diagnostic: shows how the platform classifies the CURRENTLY LOGGED-IN user.
// Built to settle the "owner vs admin" question directly, because the answer
// gates which chat tools exist (campaign creation is owner-only). Returns
// booleans about configuration — never the OWNER_EMAILS list itself — so it
// leaks nothing sensitive beyond the caller's own identity. Requires login.

import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getAccess()

  if (!ctx.userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in. Log in first, then reload this URL.' }, { status: 401 })
  }

  const ownerEmails = (process.env.OWNER_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  return NextResponse.json({
    ok: true,
    email: ctx.email,
    role: ctx.role,                                  // 'owner' | 'admin' | 'member' | 'guest'
    isOwner: ctx.isOwner,                            // must be TRUE for chat campaign creation
    isAdmin: ctx.isAdmin,
    ownerEmailsEnvConfigured: ownerEmails.length > 0, // is OWNER_EMAILS set in Vercel at all?
    thisEmailInOwnerEmails: ctx.email ? ownerEmails.includes(ctx.email) : false,
    verdict: ctx.isOwner
      ? 'You are the OWNER. The chat campaign tool is available to you — if campaign creation still fails, the cause is elsewhere and the Concierge reply text is the next clue.'
      : 'You are NOT classified as owner. The chat campaign tool is currently hidden from you (owner-only lock). Fix: add your login email to the OWNER_EMAILS environment variable in Vercel (comma-separated, lowercase), set for Production and Preview, then redeploy — or add yourself as role owner in the team_members table.',
  })
}
