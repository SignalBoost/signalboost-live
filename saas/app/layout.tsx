import "./globals.css";

export const metadata = {
  title: "SignalBoost — Turn Reviews Into Content",
  description:
    "SignalBoost transforms customer reviews into branded graphics and voice ads from one simple dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
