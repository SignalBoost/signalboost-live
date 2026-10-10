import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { euCustomerLaunchReadiness } from './euCustomerLaunchReadiness.ts'

/** A user-scoped Frankfurt client. No elevated privileges or US fallback. */
export async function authenticateEuBearer(authorization: string | null) {
  if (!euCustomerLaunchReadiness().ready) return { status: 503 as const, error: 'eu_customer_unavailable' }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization ?? '')
  if (!match) return { status: 401 as const, error: 'eu_auth_required' }
  const token = match[1]
  const client = createClient(process.env.EU_SUPABASE_URL!, process.env.EU_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user || data.user.is_anonymous) return { status: 401 as const, error: 'eu_auth_invalid' }
  return { status: 200 as const, client, user: data.user }
}
