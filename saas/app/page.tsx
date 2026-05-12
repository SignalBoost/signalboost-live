export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "60px 40px",
        background: "#05070b",
        color: "white",
      }}
    >
      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: "70px" }}>
          <h1
            style={{
              fontSize: "64px",
              color: "#FFD700",
              marginBottom: "20px",
              lineHeight: 1.1,
            }}
          >
            Grow Faster With AI Marketing
          </h1>

          <p
            style={{
              fontSize: "22px",
              color: "#aaa",
              maxWidth: "700px",
              lineHeight: 1.6,
            }}
          >
            SignalBoost helps businesses automate content,
            websites, funnels, campaigns, and lead generation
            using AI-powered tools.
          </p>

          <div
            style={{
              display: "flex",
              gap: "20px",
              marginTop: "35px",
            }}
          >
            <a href="/dashboard" style={primaryButton}>
              Open Dashboard
            </a>

            <a href="/website-generator" style={secondaryButton}>
              Generate Website
            </a>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "24px",
          }}
        >
          <FeatureCard
            title="AI Dashboard"
            description="Monitor analytics, campaigns, growth, and performance in one place."
          />

          <FeatureCard
            title="Website Generator"
            description="Generate high-converting websites instantly with AI."
          />

          <FeatureCard
            title="Automations"
            description="Automate social posts, email funnels, lead nurturing, and outreach."
          />

          <FeatureCard
            title="Content AI"
            description="Generate blog posts, ads, landing pages, and social media content."
          />

          <FeatureCard
            title="Lead Capture"
            description="Collect and qualify leads automatically with smart AI workflows."
          />

          <FeatureCard
            title="Growth Insights"
            description="Get AI recommendations to improve conversions and traffic."
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: "18px",
        padding: "28px",
      }}
    >
      <h3
        style={{
          color: "#FFD700",
          marginBottom: "12px",
          fontSize: "22px",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          color: "#999",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </div>
  );
}

const primaryButton = {
  background: "#FFD700",
  color: "#000",
  padding: "14px 24px",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: "bold",
};

const secondaryButton = {
  background: "transparent",
  color: "#FFD700",
  border: "1px solid #FFD700",
  padding: "14px 24px",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: "bold",
};
