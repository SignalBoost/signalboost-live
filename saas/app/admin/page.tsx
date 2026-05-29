const boxes = ['Overview', 'Logs', 'Outreach', 'Insights', 'Role Management']
const dashboardCards = ['Dashboards', 'Security Logs', 'Outreach Control', 'Predictive Insights', 'Partner Role Management']

export default function AdminOverviewPage() {
  return (
    <div className="space-y-8">
      <section className="sb-admin-topbar">
        <div>
          <p className="sb-eyebrow">Admin Console</p>
          <h1>Owner/Admin control center</h1>
        </div>
        <span className="sb-role-pill">Role: Owner/Admin</span>
      </section>

      <section className="sb-wireframe" aria-label="Admin Console wireframe diagram">
        <div className="sb-wireframe__markers">
          <span>▣ Desktop: sidebar + dashboard grid</span>
          <span>▤ Mobile: stacked nav + cards</span>
        </div>
        <div className="sb-wireframe__canvas">
          <aside className="sb-wireframe__sidebar">
            <span className="sb-wireframe__label">Sidebar</span>
            {boxes.map((box) => <div key={box} className="sb-wireframe__box">{box}</div>)}
          </aside>
          <div className="sb-wireframe__flow" aria-hidden="true">
            {boxes.map((box) => <span key={box}>→</span>)}
          </div>
          <main className="sb-wireframe__main">
            <div className="sb-wireframe__topbar">Admin Console <span>Owner/Admin</span></div>
            <div className="sb-wireframe__grid">
              {dashboardCards.map((card) => <div key={card} className="sb-wireframe__box sb-wireframe__box--main">{card}</div>)}
            </div>
          </main>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {dashboardCards.map((card) => (
          <article key={card} className="sb-admin-feature-card">
            <p>{card}</p>
            <strong>Live panel</strong>
            <span>Protected owner/admin workspace with audit logging and approval gates.</span>
          </article>
        ))}
      </section>
    </div>
  )
}
