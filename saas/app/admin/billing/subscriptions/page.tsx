import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='Subscriptions'
      status='Live metrics'
      action='Review paid/free subscription status and reconcile billing anomalies with Stripe records.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'Subscriptions', status: 'Live metrics', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
