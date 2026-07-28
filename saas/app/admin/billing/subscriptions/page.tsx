import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_e8b62c16b85a0cba')}
      status={uiCopy('u_098119459e5cf29a')}
      action={uiCopy('u_af3a40a9b0d63d69')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiCopy('u_5b9372f71b5b567f'), status: uiCopy('u_d3f18e6ac7df3ad5'), detail: uiCopy('u_d4c3b07c58d4d7e0') }]}
    />
  )
}
