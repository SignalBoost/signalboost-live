import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_20122c0319c6bde4')}
      status={uiText('generatedUi.u_0a165b533d15643d')}
      action={uiText('generatedUi.u_4a6aeed0fa349785')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_20122c0319c6bde4'), status: "Live metrics", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
