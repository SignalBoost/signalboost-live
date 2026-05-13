import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalBoost",
  description: "AI Content Engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-800 font-sans">
        {children}
      </body>
    </html>
  );
}
