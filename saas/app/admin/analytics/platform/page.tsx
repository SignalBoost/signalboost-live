import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_a7877962666f3f4a')}
      status={uiCopy('u_8f7b6850d3af7e38')}
      action={uiCopy('u_5497ab24eb83c3a6')}
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: uiCopy('u_4a5f02cea70cbd47'), status: uiCopy('u_e2bc5081bca2d5f6'), detail: uiCopy('u_acec668a790cba63') }]}
    />
  )
}
