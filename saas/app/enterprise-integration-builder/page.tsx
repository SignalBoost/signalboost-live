import { redirect } from 'next/navigation'
import EnterpriseIntegrationBuilder from '@/components/integration-builder/EnterpriseIntegrationBuilder'
import { getAccess } from '@/lib/auth/access'
import { uiText } from '@/lib/i18n/uiText'

export const metadata = {
  title: uiText('generatedUi.u_b5217b3a78ea8f5f'),
  description: uiText('generatedUi.u_77bf811472832d94'),
}

export default async function EnterpriseIntegrationBuilderPage() {
  const access = await getAccess()
  if (access.role === 'guest') redirect('/')
  return <EnterpriseIntegrationBuilder />
}
