import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_cda6be7c10ec43f5')}
      status={uiCopy('u_e90a1e9921d0db8f')}
      action={uiCopy('u_649787610a3c4b14')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiCopy('u_7a7f7064dac09830'), status: uiCopy('u_5d5d5eb70920d030'), detail: uiCopy('u_8f12e927d8894cfc') }]}
    />
  )
}
