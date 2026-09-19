// saas/app/hub/layout.tsx
// Server-side security gate for the Hub Console — same protection as /admin.
// Guests and non-admin users never receive this page; they are redirected before render.

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { AuthUnavailableNotice } from '@/components/auth/AuthUnavailableNotice'

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess()

  if (access.authState === 'unavailable') {
    return <main role="alert"><AuthUnavailableNotice /></main>
  }
  if (access.role === 'guest') redirect('/')
  if (!access.isAdmin) redirect('/dashboard')

  return <>{children}</>
}
