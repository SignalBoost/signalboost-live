import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_e29a5e9fff8e3744')}
      status={uiCopy('u_e2e52a16e258df28')}
      action={uiCopy('u_4fcbda78b1094972')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiCopy('u_c13e7e617289981a'), status: uiCopy('u_dba31a828227dc7f'), detail: uiCopy('u_c375cd9ac01cc8c4') }]}
    />
  )
}
