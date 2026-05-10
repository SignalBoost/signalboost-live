// saas/app/layout.js
export const metadata = {
  title: "SignalBoost",
  description: "Reviews to graphics, voice ads, and websites"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
