import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Last Successful Outreach Run'
      status='Monitoring'
      action='Confirm the latest outreach run completed successfully and inspect delivery anomalies.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'Last Successful Outreach Run', status: 'Monitoring', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
