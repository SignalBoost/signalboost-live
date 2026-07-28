import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiText } from '@/lib/i18n/uiText'

export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiText('generatedUi.u_b6504b7a28195aa4')}
      status={uiText('generatedUi.u_1dc83f605edf0ae2')}
      action={uiText('generatedUi.u_cc62e0cc8d539370')}
      externalUrl={process.env.NEXT_PUBLIC_SUPABASE_DASHBOARD_URL}
      externalLabel={uiText('generatedUi.u_a44774b2e9865de2')}
      events={[{ label: uiText('generatedUi.u_b6504b7a28195aa4'), status: "Monitoring", detail: uiText('generatedUi.u_fd56004d04368898') }]}
    />
  )
}
