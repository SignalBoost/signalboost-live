import DashboardCard from "@/components/DashboardCard";

async function getDashboardData() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      stats: {
        projects: 0,
        automations: 0,
        content: 0,
      },
    };
  }

  return res.json();
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <section style={{ padding: "40px" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "12px", color: "#FFD700" }}>
        Dashboard
      </h1>

      <p style={{ color: "#aaa", marginBottom: "40px" }}>
        Welcome to SignalBoost.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
        }}
      >
        <DashboardCard
          title="Projects"
          value={String(data.stats.projects)}
          description="Active Projects"
        />

        <DashboardCard
          title="Automations"
          value={String(data.stats.automations)}
          description="Running Workflows"
        />

        <DashboardCard
          title="Content"
          value={String(data.stats.content)}
          description="Blog Posts"
        />
      </div>
    </section>
  );
}
