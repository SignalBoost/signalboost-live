import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { assistantContentMatchesForProvenance, normalizeAssistantContent } from './supportTurnProvenance.ts'
import type { CascadePlan } from './cascadeContract.ts'

function safePlan(plan: CascadePlan): CascadePlan | null {
  try {
    const encoded = JSON.stringify(plan)
    if (!encoded || encoded.length > 24_000) return null
    return JSON.parse(encoded) as CascadePlan
  } catch {
    return null
  }
}

export async function latestCascadeRootForUser(
  userId: string,
  currentAssistantReply?: string,
): Promise<string | null> {
  if (!userId) return null
  const db = cosServiceDb()
  if (!db) return null
  try {
    const { data: rows, error } = await db.from('assistant_messages')
      .select('content,provenance').eq('user_id', userId).eq('role', 'assistant')
      .order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    for (const row of rows ?? []) {
      if (currentAssistantReply && assistantContentMatchesForProvenance(row?.content, currentAssistantReply)) continue
      const provenance = row?.provenance
      if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) continue
      const root = String((provenance as any)?.cascade?.root_question || '').trim()
      if (root) return root.slice(0, 240)
    }
    return null
  } catch (error) {
    console.error('cascadePersistence: root lookup failed', error)
    return null
  }
}

/**
 * Stores the validated cascade plan beside the exact assistant turn that rendered its chips.
 * This is lineage metadata only; it never upgrades assistant prose into factual evidence.
 */
export async function attachCascadePlanToStoredTurn(
  userId: string,
  assistantReply: string,
  plan: CascadePlan,
): Promise<boolean> {
  if (!userId || plan.candidates.length !== 2) return false
  const normalizedPlan = safePlan(plan)
  const expectedContent = normalizeAssistantContent(assistantReply)
  const db = cosServiceDb()
  if (!normalizedPlan || !expectedContent || !db) return false

  try {
    const { data: rows, error } = await db.from('assistant_messages')
      .select('id,content,provenance').eq('user_id', userId).eq('role', 'assistant')
      .order('created_at', { ascending: false }).limit(20)
    if (error) throw error
    const row = (rows ?? []).find((item: any) => assistantContentMatchesForProvenance(item?.content, assistantReply))
    if (!row?.id) return false
    const provenance = row.provenance && typeof row.provenance === 'object' && !Array.isArray(row.provenance)
      ? row.provenance
      : {}
    const updated = {
      ...provenance,
      cascade: normalizedPlan,
      suggested_followups: normalizedPlan.candidates.map(candidate => candidate.question),
    }
    const { error: updateError } = await db.from('assistant_messages')
      .update({ provenance: updated }).eq('id', row.id).eq('user_id', userId)
    if (updateError) throw updateError
    return true
  } catch (error) {
    console.error('cascadePersistence: cascade attach failed', error)
    return false
  }
}
