export default function DashboardPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#05070b",
        color: "white",
        padding: "40px",
        fontFamily: "Arial, sans-serif"
      }}
    >
      <h1
        style={{
          fontSize: "32px",
          marginBottom: "12px",
          color: "#FFD700"
        }}
      >
        Dashboard
      </h1>

      <p
        style={{
          color: "#aaa",
          marginBottom: "40px"
        }}
      >
        Welcome to SignalBoost.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px"
        }}
      >
        <div
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: "16px",
            padding: "24px"
          }}
        >
          <h2 style={{ marginBottom: "10px" }}>Projects</h2>
          <p style={{ color: "#aaa" }}>12 Active Projects</p>
        </div>

        <div
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: "16px",
            padding: "24px"
          }}
        >
          <h2 style={{ marginBottom: "10px" }}>Automations</h2>
          <p style={{ color: "#aaa" }}>5 Running Workflows</p>
        </div>

        <div
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: "16px",
            padding: "24px"
          }}
        >
          <h2 style={{ marginBottom: "10px" }}>Content</h2>
          <p style={{ color: "#aaa" }}>24 Blog Posts</p>
        </div>
      </div>
    </main>
  );
}
