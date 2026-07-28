import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_b853bce50c61dc69')}
      status={uiText('generatedUi.u_1dc83f605edf0ae2')}
      action={uiText('generatedUi.u_d19db58c94ce4720')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_b853bce50c61dc69'), status: "Monitoring", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
