import 'server-only'
import { authenticateEuBearer } from './euAuthenticatedClient.ts'

export async function resolveEuTenant(authorization: string | null) {
  const auth = await authenticateEuBearer(authorization)
  if (auth.status !== 200) return { ok: false as const, status: auth.status, error: auth.error }
  const { data: tenant, error } = await auth.client.from('eu_auth_profiles')
    .select('tenant_id').eq('user_id',auth.user.id).maybeSingle()
  if (error || !tenant?.tenant_id) return { ok: false as const, status: 403 as const, error: 'eu_tenant_not_provisioned' }
  return { ok: true as const, userId: auth.user.id, tenantId: tenant.tenant_id as string, client: auth.client }
}
