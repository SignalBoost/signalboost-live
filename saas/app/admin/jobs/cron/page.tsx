import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_3ced42663bf447b1')}
      status={uiText('generatedUi.u_1dc83f605edf0ae2')}
      action={uiText('generatedUi.u_6c465f4f419d9a66')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiText('generatedUi.u_3ced42663bf447b1'), status: "Monitoring", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
