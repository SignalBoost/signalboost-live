import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Daily Job Results'
      status='Monitoring'
      action='Review the latest daily automation result and rerun only after resolving upstream failures.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'Daily Job Results', status: 'Monitoring', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
