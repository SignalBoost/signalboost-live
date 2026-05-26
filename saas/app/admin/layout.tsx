import AdminLayoutShell from '@/components/admin/AdminLayoutShell'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>
}
