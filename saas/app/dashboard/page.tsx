import DashboardCard from "@/components/DashboardCard";

async function getDashboardData() {
  try {
    const res = await fetch(
      "https://saas.signalboostapp.com/api/dashboard",
      {
        cache: "no-store",
      }
    );

    return await res.json();
  } catch (error) {
    return {
      stats: {
        projects: 0,
        automations: 0,
        content: 0,
      },
    };
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <section
      style={{
        padding: "40px",
        background: "#05070b",
        minHeight: "100vh",
        color: "white",
      }}
    >
      <h1
        style={{
          fontSize: "40px",
          color: "#FFD700",
          marginBottom: "12px",
        }}
      >
        Dashboard
      </h1>

      <p
        style={{
          color: "#999",
          marginBottom: "40px",
        }}
      >
        Welcome to SignalBoost.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(260px, 1fr))",
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
