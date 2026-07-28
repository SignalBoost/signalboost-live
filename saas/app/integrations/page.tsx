import { redirect } from 'next/navigation'
import ToolBuilder from '@/components/ToolBuilder'
import { getAccess } from '@/lib/auth/access'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export const metadata = {
  title: uiCopy('u_37139ca0531665c8'),
  description: uiCopy('u_c5fb11921f15773e'),
}

export default async function IntegrationsPage() {
  const access = await getAccess()

  if (access.role === 'guest') redirect('/')

  return <ToolBuilder />
}
