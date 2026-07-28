import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_760c9a2494e9d2e0')}
      status={uiText('generatedUi.u_c2eb8cd9d9564314')}
      action={uiText('generatedUi.u_61978ae8b0e8e9ab')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_760c9a2494e9d2e0'), status: "Attention", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
