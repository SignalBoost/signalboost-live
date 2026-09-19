// saas/app/admin/layout.tsx
// Server-side owner gate for the entire /admin section.

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { AuthUnavailableNotice } from '@/components/auth/AuthUnavailableNotice'
import AdminLayoutShell from '@/components/admin/AdminLayoutShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess()

  if (access.authState === 'unavailable') {
    return <main role="alert"><AuthUnavailableNotice /></main>
  }
  if (access.role === 'guest') redirect('/')
  if (!access.isOwner) redirect('/dashboard')

  return <AdminLayoutShell>{children}</AdminLayoutShell>
}
