import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_529c59ead98b9dd7')}
      status={uiText('generatedUi.u_1dc83f605edf0ae2')}
      action={uiText('generatedUi.u_4c948b5f4c03e9a4')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_529c59ead98b9dd7'), status: "Monitoring", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
