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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1
            style={{
              color: "#FFD700",
              margin: 0,
              fontSize: "28px",
            }}
          >
            SignalBoost
          </h1>

          <nav
            style={{
              display: "flex",
              gap: "20px",
            }}
          >
            <a href="/" style={navLink}>
              Home
            </a>

            <a href="/dashboard" style={navLink}>
              Dashboard
            </a>

            <a href="/website-generator" style={navLink}>
              Website Generator
            </a>

            <a href="/automations" style={navLink}>
              Automations
            </a>

            <a href="/settings" style={navLink}>
              Settings
            </a>
          </nav>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}

const navLink = {
  color: "#aaa",
  textDecoration: "none",
  fontSize: "15px",
};
