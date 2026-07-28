import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_76a86b16c5d212f5')}
      status={uiText('generatedUi.u_1dc83f605edf0ae2')}
      action={uiText('generatedUi.u_fc1d2cedb6127a93')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_76a86b16c5d212f5'), status: "Monitoring", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
