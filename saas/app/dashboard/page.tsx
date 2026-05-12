export default function DashboardPage() {
  const stats = {
    projects: 12,
    automations: 5,
    content: 24,
  };

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
          fontSize: "48px",
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
          fontSize: "18px",
        }}
      >
        Welcome to SignalBoost.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "20px",
        }}
      >
        <DashboardCard
          title="Projects"
          value={String(stats.projects)}
          description="Active Projects"
        />

        <DashboardCard
          title="Automations"
          value={String(stats.automations)}
          description="Running Workflows"
        />

        <DashboardCard
          title="Content"
          value={String(stats.content)}
          description="Blog Posts"
        />
      </div>
    </section>
  );
}

function DashboardCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div
      style={{
        background: "#111722",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: "18px",
        padding: "24px",
      }}
    >
      <h2
        style={{
          color: "#FFD700",
          marginBottom: "10px",
          fontSize: "20px",
        }}
      >
        {title}
      </h2>

      <div
        style={{
          fontSize: "42px",
          fontWeight: "bold",
          marginBottom: "10px",
        }}
      >
        {value}
      </div>

      <p
        style={{
          color: "#999",
        }}
      >
        {description}
      </p>
    </div>
  );
}
