import AdminSectionView from '@/components/admin/AdminSectionView'
import { ADMIN_SECTIONS } from '@/lib/admin/sections'

export default function Page() {
  return <AdminSectionView section={ADMIN_SECTIONS.ai} />
}
