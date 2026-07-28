import { redirect } from 'next/navigation'
import ToolBuilder from '@/components/ToolBuilder'
import { getAccess } from '@/lib/auth/access'
import { uiText } from '@/lib/i18n/uiText'

export const metadata = {
  title: uiText('generatedUi.u_9c05fbe2419a719e'),
  description: uiText('generatedUi.u_f0357ee708bb2125'),
}

export default async function IntegrationsPage() {
  const access = await getAccess()

  if (access.role === 'guest') redirect('/')

  return <ToolBuilder />
}
