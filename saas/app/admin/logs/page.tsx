import AdminDrilldownPage from '@/components/admin/AdminDrilldownPage'

export default function Page() {
  return (
    <AdminDrilldownPage
      title='API Errors'
      status='Attention'
      action='Review recent API exceptions and triage repeated failures before customer impact grows.'
      externalUrl={undefined}
      externalLabel={undefined}
      events={[{ label: 'API Errors', status: 'Attention', detail: 'Awaiting live event feed for this owner/admin drill-down.' }]}
    />
  )
}
