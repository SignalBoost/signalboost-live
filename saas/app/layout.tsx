import "./globals.css";

export const metadata = {
  title: "SignalBoost Dashboard",
  description: "Create AI content from reviews, prompts, and campaigns.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
