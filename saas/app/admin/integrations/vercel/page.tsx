import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default function Page() {
  return (
    <AdminDrilldownPage
      title={uiCopy('u_8b8efca609944c40')}
      status={uiCopy('u_25d0bbac23148cbf')}
      action={uiCopy('u_a31a5521b4511095')}
      externalUrl={process.env.NEXT_PUBLIC_VERCEL_PROJECT_URL}
      externalLabel={uiCopy('u_28b4848a78ab77c0')}
      events={[{ label: uiCopy('u_9b2a520b8db6bfc5'), status: uiCopy('u_80a985be4b124f7d'), detail: uiCopy('u_348f0de6c073a977') }]}
    />
  )
}
