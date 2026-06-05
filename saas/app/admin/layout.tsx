// saas/app/admin/layout.tsx
// Server-side gate for the entire /admin section.
// Anyone who is not owner/admin is redirected to the dashboard, even if they type the URL directly.

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import AdminLayoutShell from '@/components/admin/AdminLayoutShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess()

  // Not signed in -> send to home (login lives there). Signed in but not admin -> dashboard.
  if (access.role === 'guest') redirect('/')
  if (!access.isAdmin) redirect('/dashboard')

  return <AdminLayoutShell>{children}</AdminLayoutShell>
}
