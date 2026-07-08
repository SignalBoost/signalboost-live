import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Last Successful Prospect Discovery Run'
      status='Monitoring'
      action='Confirm prospect discovery completed and review any source or enrichment failures.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'Last Successful Prospect Discovery Run', status: 'Monitoring', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
