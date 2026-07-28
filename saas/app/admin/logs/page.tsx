import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_1b11b5a8dd3d896c')}
      status={uiCopy('u_502f467947dbec0e')}
      action={uiCopy('u_5d32d27e846b55c7')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiCopy('u_dc2f6c727b6ddbcd'), status: uiCopy('u_118cd5ad8914a491'), detail: uiCopy('u_c17673712e11f740') }]}
    />
  )
}
