import OrchestrationPanel from '@/components/orchestration/OrchestrationPanel'
import OutreachDashboardClient from '@/components/outreach/OutreachDashboardClient'

export default function OutreachPage() {
  return (
    <>
      <section className="sb-page-shell" style={{ paddingTop: 16 }}>
        <OrchestrationPanel module="outreach" compact />
      </section>
      <OutreachDashboardClient />
    </>
  )
}
