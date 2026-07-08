import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Platform Totals'
      status='Live metrics'
      action='Review account, subscription, prospect, outreach, and content totals for anomalies.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'Platform Totals', status: 'Live metrics', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
