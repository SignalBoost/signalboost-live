import { redirect } from 'next/navigation'
import EnterpriseIntegrationBuilder from '@/components/integration-builder/EnterpriseIntegrationBuilder'
import { getAccess } from '@/lib/auth/access'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export const metadata = {
  title: uiCopy('u_023955647b791864'),
  description: uiCopy('u_9addb1e2352bbb56'),
}

export default async function EnterpriseIntegrationBuilderPage() {
  const access = await getAccess()
  if (access.role === 'guest') redirect('/')
  return <EnterpriseIntegrationBuilder />
}
