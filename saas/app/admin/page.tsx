import AdminSectionView from '@/components/admin/AdminSectionView'
import { ADMIN_SECTIONS } from '@/lib/admin/sections'

export default function AdminOverviewPage() {
  return <AdminSectionView section={ADMIN_SECTIONS.overview} />
}
