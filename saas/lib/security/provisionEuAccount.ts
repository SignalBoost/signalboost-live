import 'server-only'
import { getEuAdminSupabase } from './euSupabaseServer.ts'
import { proposedEnrollmentRegion } from './euEnrollmentRouting.ts'

/** Invoked only after the identity exists in the Frankfurt Supabase Auth project. */
export async function provisionEuAccount(input: {
  euAuthUserId: string
  countryCode: string
  displayName?: string
}): Promise<void> {
  const countryCode = input.countryCode.trim().toUpperCase()
  if (proposedEnrollmentRegion(countryCode) !== 'EU_EEA') {
    throw new Error('eu_enrollment_country_invalid')
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.euAuthUserId)) {
    throw new Error('eu_auth_user_id_invalid')
  }
  // Server-only, readiness-gated, never fall back to the primary US client.
  const eu = getEuAdminSupabase()
  const { error } = await eu.rpc('provision_eu_account', {
    p_user_id: input.euAuthUserId,
    p_country_code: countryCode,
    p_display_name: input.displayName?.trim().slice(0, 160) || null,
  })
  if (error) throw new Error('eu_account_provisioning_failed')
}
