import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_5bf1264e13095b00')}
      status={uiCopy('u_133ecd926c25218d')}
      action={uiCopy('u_e829473af0c26b86')}
      externalUrl={process.env.NEXT_PUBLIC_VERCEL_PROJECT_URL}
      externalLabel={uiCopy('u_ab94d7bc894fdf1e')}
      events={[{ label: uiCopy('u_f5f767046a7e103e'), status: uiCopy('u_2b95eefd32faf178'), detail: uiCopy('u_fb1140fd05a71525') }]}
    />
  )
}
