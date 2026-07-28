import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_a151f2e912fe8d5b')}
      status={uiText('generatedUi.u_0a165b533d15643d')}
      action={uiText('generatedUi.u_350280cc71bb20d1')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_a151f2e912fe8d5b'), status: "Live metrics", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
