import { redirect } from 'next/navigation'
import ToolBuilder from '@/components/ToolBuilder'
import { getAccess } from '@/lib/auth/access'

export const metadata = {
  title: 'Integrations · SignalBoost',
  description: 'Build and manage governed SignalBoost integrations.',
}

export default async function IntegrationsPage() {
  const access = await getAccess()

  if (access.role === 'guest') redirect('/')

  return <ToolBuilder />
}
