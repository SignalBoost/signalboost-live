// saas/lib/outreach/customer.ts
// Customer-facing outreach: per-user scoped drafts with plan gating.
// Customers on Growth or Command create and manage outreach drafts for THEIR
// OWN business. Every row is isolated by user_id; admins retain full oversight
// through the existing admin routes. Sending in v1 is done from the customer's
// own email app (no platform-domain sending on their behalf).

import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import { getAccess } from '@/lib/auth/access'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'

const OUTREACH_TABLE = 'outreach_queue'
export const OUTREACH_PLANS = ['growth', 'command']
export const DAILY_DRAFT_CAP = 10

// House pattern (see lib/auth/access.ts): all fields always present, no narrowing needed.
export type CustomerOutreachAccess = {
  ok: boolean
  status: number              // 200 when ok
  error: string               // '' when ok
  reason: 'ok' | 'unauthenticated' | 'plan'
  userId: string              // '' when not ok
  isAdmin: boolean
}

export type CustomerDraft = {
  id: string
  business_name: string | null
  business_url: string | null
  outreach_message: string | null
  status: string
  source_platform: string
  created_at: string
}

function db() {
  return getAdminSupabase()
}

// ── Access: logged in + (admin OR active Growth/Command subscription) ─────────
export async function getCustomerOutreachAccess(): Promise<CustomerOutreachAccess> {
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized', reason: 'unauthenticated', userId: '', isAdmin: false }
  }

  try {
    const access = await getAccess()
    if (access.isAdmin) {
      return { ok: true, status: 200, error: '', reason: 'ok', userId: user.id, isAdmin: true }
    }
  } catch {
    // fall through to plan check
  }

  const { data } = await db()
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .limit(5)

  const eligible = (data ?? []).some(s => OUTREACH_PLANS.includes(String(s.plan || '').toLowerCase()))
  if (!eligible) {
    return {
      ok: false,
      status: 403,
      error: 'Outreach requires the Growth or Command plan.',
      reason: 'plan',
      userId: user.id,
      isAdmin: false,
    }
  }

  return { ok: true, status: 200, error: '', reason: 'ok', userId: user.id, isAdmin: false }
}

// Plan check by userId only (for AI tool calls where the request user is known).
export async function isOutreachEligible(userId: string): Promise<boolean> {
  const { data } = await db()
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .limit(5)
  return (data ?? []).some(s => OUTREACH_PLANS.includes(String(s.plan || '').toLowerCase()))
}

// ── Daily creation cap ──────────────────────────────────────────────────────────
export async function countDraftsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await db()
    .from(OUTREACH_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
  return count || 0
}

// ── Create a draft owned by the customer ───────────────────────────────────────
export async function createCustomerDraft(params: {
  userId: string
  businessName: string
  businessUrl: string
  message: string
  source?: 'concierge' | 'manual'
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const businessName = String(params.businessName || '').trim().slice(0, 200)
    const businessUrl = String(params.businessUrl || '').trim().slice(0, 500)
    const message = String(params.message || '').trim()

    if (!businessName || !message) {
      return { ok: false, error: 'Business name and message are required.' }
    }
    if (!businessUrl || !/^https?:\/\//i.test(businessUrl)) {
      return { ok: false, error: 'A valid website URL starting with http(s):// is required.' }
    }

    const safe = assertSafeOutreachMessage(message)
    if (!safe.ok) {
      return { ok: false, error: `Message rejected by guardrails: ${safe.reason}` }
    }

    const used = await countDraftsToday(params.userId)
    if (used >= DAILY_DRAFT_CAP) {
      return { ok: false, error: `Daily limit reached (${DAILY_DRAFT_CAP} drafts per 24h). Try again tomorrow.` }
    }

    const { data, error } = await db()
      .from(OUTREACH_TABLE)
      .insert({
        user_id: params.userId,
        business_id: null,
        source_platform: params.source === 'manual' ? 'manual' : 'concierge',
        business_name: businessName,
        business_url: businessUrl,
        outreach_message: message,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error creating draft' }
  }
}

// ── List the customer's own drafts ──────────────────────────────────────────────
export async function listCustomerDrafts(
  userId: string,
  limit = 30,
): Promise<{ ok: boolean; drafts: CustomerDraft[]; error?: string }> {
  try {
    const { data, error } = await db()
      .from(OUTREACH_TABLE)
      .select('id, business_name, business_url, outreach_message, status, source_platform, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50))

    if (error) return { ok: false, drafts: [], error: error.message }
    return { ok: true, drafts: (data ?? []) as CustomerDraft[] }
  } catch (err) {
    return { ok: false, drafts: [], error: err instanceof Error ? err.message : 'Unknown error listing drafts' }
  }
}

export function formatCustomerDraftsForAI(drafts: CustomerDraft[]): string {
  if (!drafts.length) {
    return 'This user has no outreach drafts yet. Offer to create one with createMyOutreachDraft (requires target business name, website URL, and a message of 40-2,400 characters).'
  }
  const blocks = drafts.slice(0, 10).map(d => {
    const date = new Date(d.created_at).toUTCString().slice(0, 16)
    return `• [${d.status}] ${d.business_name || 'Unnamed'} (${date})\n  ${String(d.outreach_message || '').slice(0, 160)}…`
  })
  return `USER'S OUTREACH DRAFTS (their own, newest first):\n\n${blocks.join('\n\n')}\n\nThey can review, approve, and send from the My Outreach page (Grow menu).`
}

// ── Update status of the customer's OWN draft only ─────────────────────────────
export async function setCustomerDraftStatus(
  userId: string,
  id: string,
  status: 'approved' | 'rejected',
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!['approved', 'rejected'].includes(status)) {
      return { ok: false, error: 'Invalid status.' }
    }
    const patch: Record<string, unknown> = { status }
    if (status === 'approved') {
      patch.approved_by = userId
      patch.approved_at = new Date().toISOString()
    } else {
      patch.approved_by = null
      patch.approved_at = null
    }

    const { data, error } = await db()
      .from(OUTREACH_TABLE)
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId) // ownership enforced at the query level
      .select('id')

    if (error) return { ok: false, error: error.message }
    if (!data || data.length === 0) return { ok: false, error: 'Draft not found.' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error updating draft' }
  }
}
