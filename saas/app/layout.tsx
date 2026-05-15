// 1. IMPORT YOUR CSS (This is what fixes the "1995" look)
import "./globals.css"; 

import { Inter } from "next/font/google";
import { I18nProvider } from "@/components/i18n/I18nProvider";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* 2. ADD THE FONT CLASS TO BODY */}
      <body className={inter.className}>
        {/* 3. WRAP CHILDREN IN THE PROVIDER (If using i18n) */}
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
