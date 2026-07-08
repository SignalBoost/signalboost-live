import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Prospects'
      status='Live metrics'
      action='Review prospect inventory, approval status, and discovery source quality.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'Prospects', status: 'Live metrics', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
