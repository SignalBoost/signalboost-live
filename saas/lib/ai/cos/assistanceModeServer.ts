// saas/lib/ai/cos/assistanceModeServer.ts
//
// Server side of the user's assistance mode: the request's choice, else the one saved on the user's account, else
// Handle it for me. Shared by every route that starts Builder work, so no route can lose the user's choice.
// Production 2026-10-22: chat sent the acceptance spec straight to /api/builder, which never read the mode, and a
// Work with me job published without asking.

import { getAdminSupabase } from '@/utils/supabase/server'
import { ASSISTANCE_MODE_METADATA_KEY, DEFAULT_ASSISTANCE_MODE, normalizeAssistanceMode, type AssistanceMode } from './assistanceMode.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The mode the signed-in user saved on their account (chosen in any chat; follows them to every device). */
export async function storedAssistanceMode(userId: string | null | undefined): Promise<AssistanceMode | null> {
  if (!userId || !UUID.test(userId)) return null
  try {
    const { data } = await getAdminSupabase().auth.admin.getUserById(userId)
    return normalizeAssistanceMode(data?.user?.user_metadata?.[ASSISTANCE_MODE_METADATA_KEY])
  } catch {
    return null
  }
}

export async function resolveAssistanceMode(requested: unknown, userId: string | null | undefined): Promise<AssistanceMode> {
  return normalizeAssistanceMode(requested) ?? await storedAssistanceMode(userId) ?? DEFAULT_ASSISTANCE_MODE
}
