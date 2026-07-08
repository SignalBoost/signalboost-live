import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Supabase Connection Status'
      status='Monitoring'
      action='Check database availability, auth health, and recent query or connection errors.'
      externalUrl={process.env.NEXT_PUBLIC_SUPABASE_DASHBOARD_URL}
      externalLabel='Open Supabase'
      events={[{ label: 'Supabase Connection Status', status: 'Monitoring', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
