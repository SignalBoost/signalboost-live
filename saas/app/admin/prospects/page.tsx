import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_376dda6bce1a20b7')}
      status={uiText('generatedUi.u_0a165b533d15643d')}
      action={uiText('generatedUi.u_560c086e3d353b3f')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_376dda6bce1a20b7'), status: "Live metrics", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
