import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='New Accounts'
      status='Live metrics'
      action='Review recent signups and investigate suspicious spikes, failed onboarding, or owner escalations.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'New Accounts', status: 'Live metrics', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
