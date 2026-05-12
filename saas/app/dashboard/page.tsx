import DashboardCard from "@/components/DashboardCard";

export default function DashboardPage() {
  return (
    <section
      style={{
        padding: "40px",
      }}
    >
      <h1
        style={{
          fontSize: "32px",
          marginBottom: "12px",
          color: "#FFD700",
        }}
      >
        Dashboard
      </h1>

      <p
        style={{
          color: "#aaa",
          marginBottom: "40px",
        }}
      >
        Welcome to SignalBoost.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
        }}
      >
        <DashboardCard
          title="Projects"
          value="12"
          description="Active Projects"
        />

        <DashboardCard
          title="Automations"
          value="5"
          description="Running Workflows"
        />

        <DashboardCard
          title="Content"
          value="24"
          description="Blog Posts"
        />
      </div>
    </section>
  );
}
