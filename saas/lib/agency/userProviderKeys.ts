// saas/lib/agency/userProviderKeys.ts
// Server-side helper: resolve a user's stored BYOK provider key (decrypted in memory only).

import { getAdminSupabase } from '@/utils/supabase/server'
import { vaultDecrypt } from '@/lib/vault/crypto'

export async function resolveUserProviderKey(userId: string, providerId: string): Promise<string | null> {
  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('user_provider_keys')
    .select('value_encrypted, iv, tag')
    .eq('user_id', userId)
    .eq('provider', providerId)
    .single()
  if (error || !data) return null
  const dec = vaultDecrypt(data.value_encrypted, data.iv, data.tag)
  if (!dec.ok) return null
  await admin.from('user_provider_keys').update({ last_used_at: new Date().toISOString() }).eq('user_id', userId).eq('provider', providerId)
  return dec.value || null
}
