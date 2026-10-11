import { LabIntegrationText } from '@/components/i18n/LabIntegrationText'
import EuWorkspaceControls from '@/components/eu/EuWorkspaceControls'
import EuAccountControls from '@/components/eu/EuAccountControls'
import Link from 'next/link'
import { euCustomerLaunchReadiness } from '@/lib/security/euCustomerLaunchReadiness.ts'
import { getEuUserSupabase } from '@/lib/security/euUserSupabaseServer.ts'
import { uiText } from '@/lib/i18n/uiText'


export const dynamic = 'force-dynamic'

export default async function EuAccountPage() {
  const readiness = euCustomerLaunchReadiness()
  if (!readiness.ready) {
    return <main style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
      <h1>{uiText('generatedUi.u_d2d3109cbacf0a41')}</h1>
      <p>{uiText('generatedUi.u_f06d45815a9c047d')}</p>
      <Link href="/eu/access"><LabIntegrationText id="u_4deb6d43373f" /></Link>
    </main>
  }

  const eu = await getEuUserSupabase()
  const { data, error } = await eu.auth.getUser()
  if (error || !data.user) {
    return <main style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
      <h1>{uiText('generatedUi.u_fb78737aa9e7dba8')}</h1>
      <p>{uiText('generatedUi.u_96004513494635b2')}</p>
      <Link href="/">{uiText('generatedUi.u_2af5c4957e43e5de')}</Link>
    </main>
  }

  const { data: binding, error: bindingError } = await eu.from('eu_auth_profiles')
    .select('tenant_id').eq('user_id', data.user.id).maybeSingle()
  if (bindingError || !binding) {
    return <main style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
      <h1>{uiText('generatedUi.u_3981d43d273b483c')}</h1>
      <p>{uiText('generatedUi.u_56c6c4fa5a11004c')}</p>
      <Link href="/eu/access"><LabIntegrationText id="u_f4ba89c99393" /></Link>
    </main>
  }
  return <main style={{ maxWidth: 640, margin: '64px auto', padding: 24 }}>
    <h1>{uiText('generatedUi.u_2d6f36be6db892d3')}</h1>
    <p>{uiText('generatedUi.u_1c226f074c356e7e')}</p>
    <p>{uiText('generatedUi.u_bdf2df8f973c1202')}</p>
    <EuAccountControls />
    <EuWorkspaceControls />
  </main>
}
