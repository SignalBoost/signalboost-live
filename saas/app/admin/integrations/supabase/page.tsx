import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_2a28ae00b98b6e00')}
      status={uiCopy('u_47a34d07b6a37703')}
      action={uiCopy('u_361d09db72383464')}
      externalUrl={process.env.NEXT_PUBLIC_SUPABASE_DASHBOARD_URL}
      externalLabel={uiCopy('u_11773554c0d7ef9b')}
      events={[{ label: uiCopy('u_11d9ed55b2f147dd'), status: uiCopy('u_4c4d9a8087424afc'), detail: uiCopy('u_25b23b22bf6b7f41') }]}
    />
  )
}
