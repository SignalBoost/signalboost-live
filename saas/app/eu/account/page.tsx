import Link from 'next/link'
import { euCustomerLaunchReadiness } from '@/lib/security/euCustomerLaunchReadiness.ts'
import { getEuUserSupabase } from '@/lib/security/euUserSupabaseServer.ts'

export const dynamic = 'force-dynamic'

export default async function EuAccountPage() {
  const readiness = euCustomerLaunchReadiness()
  if (!readiness.ready) {
    return <main style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
      <h1>European account enrollment is not available yet</h1>
      <p>European account access will open after regional authentication, application data routing and privacy workflows are verified. No account information is transferred to another region.</p>
      <Link href="/">Return to iTMounts</Link>
    </main>
  }

  const eu = await getEuUserSupabase()
  const { data, error } = await eu.auth.getUser()
  if (error || !data.user) {
    return <main style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
      <h1>Sign in to your European account</h1>
      <p>Your European session is missing or expired. Sign-in must be completed through the Frankfurt authentication service.</p>
      <Link href="/">Return to iTMounts</Link>
    </main>
  }

  const { data: binding, error: bindingError } = await eu.from('eu_auth_profiles')
    .select('tenant_id').eq('user_id', data.user.id).maybeSingle()
  if (bindingError || !binding) {
    return <main style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
      <h1>European account setup incomplete</h1>
      <p>Your regional account is not fully provisioned. Access is temporarily limited to prevent cross-region data access.</p>
    </main>
  }
  return <main style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
    <h1>European account</h1>
    <p>Your session and tenant binding were verified against the Frankfurt project.</p>
    <p>Application workspaces remain unavailable until their EU data workflows are independently verified.</p>
  </main>
}
