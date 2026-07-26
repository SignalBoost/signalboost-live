// saas/app/dashboard/supervisor/protocol-capabilities/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { getCurrentUser } from '@/utils/supabase/server'
import ProtocolCapabilityCatalogClient, { labelsForLocale } from './ProtocolCapabilityCatalogClient.tsx'

const locale = (value?: string) => {
  const candidate = (value || 'en').slice(0, 2).toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(candidate) ? candidate : 'en'
}

export default async function ProtocolCapabilityCatalogPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const labels = labelsForLocale(locale((await cookies()).get('sb_locale')?.value))
  const access = await getAccess()
  if (!access.isAdmin) {
    return (
      <main style={page}>
        <h1>{labels.title}</h1>
        <p>{labels.adminRequired}</p>
      </main>
    )
  }

  return <ProtocolCapabilityCatalogClient labels={labels} />
}

const page = {
  minHeight: '100vh',
  padding: 32,
  color: '#fff',
  background: 'linear-gradient(135deg,#06111f,#05070c)',
}