import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { I18nProvider } from "@/components/i18n/I18nProvider";

export const metadata: Metadata = {
  title: "SignalBoost",
  description: "Build your brand in every language",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <I18nProvider>
          <Navbar />
          {children}
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
