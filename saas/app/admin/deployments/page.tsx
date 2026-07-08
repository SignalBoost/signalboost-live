import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Failed Builds/Deployments'
      status='Monitoring'
      action='Inspect failed deployment events, retry only after confirming the failing commit or environment setting.'
      externalUrl={process.env.NEXT_PUBLIC_VERCEL_PROJECT_URL}
      externalLabel='Open Vercel'
      events={[{ label: 'Failed Builds/Deployments', status: 'Monitoring', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
