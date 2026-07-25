import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { getCurrentUser } from '@/utils/supabase/server'
import ProtocolCapabilityCatalogClient from './ProtocolCapabilityCatalogClient'

export default async function ProtocolCapabilityCatalogPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const access = await getAccess()
  if (!access.isAdmin) {
    return (
      <main style={page}>
        <h1>Protocol capability catalog</h1>
        <p>Administrator access is required.</p>
      </main>
    )
  }

  return <ProtocolCapabilityCatalogClient />
}

const page = {
  minHeight: '100vh',
  padding: 32,
  color: '#fff',
  background: 'linear-gradient(135deg,#06111f,#05070c)',
}
