import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Vercel/Deployment Status'
      status='Monitoring'
      action='Confirm the latest production deployment is healthy and investigate active or errored states.'
      externalUrl={process.env.NEXT_PUBLIC_VERCEL_PROJECT_URL}
      externalLabel='Open Vercel'
      events={[{ label: 'Vercel/Deployment Status', status: 'Monitoring', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
