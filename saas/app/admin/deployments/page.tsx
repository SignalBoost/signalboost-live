import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_5b92f3719c32c64b')}
      status={uiText('generatedUi.u_1dc83f605edf0ae2')}
      action={uiText('generatedUi.u_091cc48a98eafad7')}
      externalUrl={process.env.NEXT_PUBLIC_VERCEL_PROJECT_URL}
      externalLabel={uiText('generatedUi.u_98abd37203b9f939')}
      events={[{ label: uiText('generatedUi.u_5b92f3719c32c64b'), status: "Monitoring", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
