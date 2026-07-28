import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_cf1182aeffc04f89')}
      status={uiCopy('u_a1f912d6f052e5c6')}
      action={uiCopy('u_a9a550e2d186a98f')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiCopy('u_c2544728c3db1c65'), status: uiCopy('u_e30697b6beb8be41'), detail: uiCopy('u_10749568e116b64f') }]}
    />
  )
}
