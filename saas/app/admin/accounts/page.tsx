import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_5f975663497008f9')}
      status={uiCopy('u_2419b6c6212ed6fe')}
      action={uiCopy('u_6f0fb0e2181bf989')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiCopy('u_ea56ace1d157fb04'), status: uiCopy('u_63a681a48654f864'), detail: uiCopy('u_cd8e80e4b0f67b19') }]}
    />
  )
}
