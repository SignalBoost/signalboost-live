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
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0f1117",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflowX: "hidden",
        }}
      >
        {/* Animated ambient mesh gradient layer */}
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "60vw", height: "60vw", background: "radial-gradient(circle, rgba(255,195,0,0.18) 0%, rgba(255,195,0,0) 70%)", filter: "blur(60px)", animation: "meshFloat1 22s ease-in-out infinite" }} />
          <div style={{ position: "absolute", top: "30%", right: "-15%", width: "55vw", height: "55vw", background: "radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0) 70%)", filter: "blur(60px)", animation: "meshFloat2 26s ease-in-out infinite" }} />
          <div style={{ position: "absolute", bottom: "-15%", left: "20%", width: "50vw", height: "50vw", background: "radial-gradient(circle, rgba(74,222,128,0.10) 0%, rgba(74,222,128,0) 70%)", filter: "blur(60px)", animation: "meshFloat3 28s ease-in-out infinite" }} />
          <div style={{ position: "absolute", top: "55%", left: "5%", width: "45vw", height: "45vw", background: "radial-gradient(circle, rgba(168,85,247,0.10) 0%, rgba(168,85,247,0) 70%)", filter: "blur(60px)", animation: "meshFloat4 30s ease-in-out infinite" }} />
        </div>

        {/* Content layer */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, width: "100%" }}>
          <I18nProvider>
            <Navbar />
            {children}
            <Footer />
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}
