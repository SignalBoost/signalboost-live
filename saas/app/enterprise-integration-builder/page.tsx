import { redirect } from 'next/navigation'
import EnterpriseIntegrationBuilder from '@/components/integration-builder/EnterpriseIntegrationBuilder'
import { getAccess } from '@/lib/auth/access'

export const metadata = {
  title: 'Enterprise Integration Builder · SignalBoost',
  description: 'No-code provider-backed integration blueprint builder.',
}

export default async function EnterpriseIntegrationBuilderPage() {
  const access = await getAccess()
  if (access.role === 'guest') redirect('/')
  return <EnterpriseIntegrationBuilder />
}
