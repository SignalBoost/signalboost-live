// saas/lib/ai/cos/cosUniversityOperatorActions.ts
//
// Step 1 "no manual intervention" evidence (2026-10-07). Owner-authenticated admin actions that can move or steer the
// University line are recorded in cos_university_operator_actions (source admin_route). Direct database writes by any
// session other than the platform's are recorded by the trigger in migration 20261007030000. The Step 1 report counts both.
//
// Recording never blocks the owner's action: a failed insert is logged and the action proceeds, because an approval or a
// pause must not depend on the evidence table being reachable. The actor is the owner's user id, never an email or token.
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const OPERATOR_ACTIONS_TABLE = 'cos_university_operator_actions' as const

export async function recordAdminOperatorAction(input: { route: string; operation: string; actorUserId: string | null | undefined }): Promise<boolean> {
  try {
    const db = cosServiceDb()
    if (!db) return false
    const { error } = await db.from(OPERATOR_ACTIONS_TABLE).insert({
      source: 'admin_route',
      actor: String(input.actorUserId || 'owner').slice(0, 120),
      target: String(input.route).slice(0, 160),
      operation: String(input.operation).slice(0, 80),
    })
    if (error) {
      console.warn('[cos-university-operator-action]', String(error.message || error).slice(0, 200))
      return false
    }
    return true
  } catch (error) {
    console.warn('[cos-university-operator-action]', (error instanceof Error ? error.message : String(error)).slice(0, 200))
    return false
  }
}
// end of saas/lib/ai/cos/cosUniversityOperatorActions.ts (if this line is missing, the paste was cut short)
