import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_d986229b4a090625')}
      status={uiText('generatedUi.u_0a165b533d15643d')}
      action={uiText('generatedUi.u_cc18d165777f1265')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_d986229b4a090625'), status: "Live metrics", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
