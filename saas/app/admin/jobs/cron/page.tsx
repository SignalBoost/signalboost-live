import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Cron Job Status'
      status='Monitoring'
      action='Verify scheduled jobs are enabled and investigate missed or disabled cron definitions.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'Cron Job Status', status: 'Monitoring', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
