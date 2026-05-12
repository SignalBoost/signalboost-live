import "./globals.css";

export const metadata = {
  title: "SignalBoost",
  description: "AI Marketing Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#05070b",
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <header
          style={{
            padding: "20px",
            borderBottom: "1px solid #222",
          }}
        >
          <h1 style={{ color: "#FFD700", margin: 0 }}>
            SignalBoost
          </h1>

          <nav style={{ marginTop: "12px" }}>
            <a
              href="/dashboard"
              style={{
                marginRight: "20px",
                color: "#aaa",
              }}
            >
              Dashboard
            </a>

            <a
              href="/website-generator"
              style={{
                marginRight: "20px",
                color: "#aaa",
              }}
            >
              Website Generator
            </a>

            <a
              href="/automations"
              style={{
                marginRight: "20px",
                color: "#aaa",
              }}
            >
              Automations
            </a>

            <a
              href="/settings"
              style={{
                color: "#aaa",
              }}
            >
              Settings
            </a>
          </nav>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}
