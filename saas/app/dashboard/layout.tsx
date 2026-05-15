// saas/app/layout.tsx
import React from 'react';
import '@/app/globals.css'; // Make sure this path matches your global styles import

export const metadata = {
  title: 'SignalBoost App Suite',
  description: 'AI Multi-Language Platform Generator',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-[#060913]">
      <body className="bg-[#060913] min-h-screen text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
