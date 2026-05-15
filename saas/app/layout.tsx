// saas/app/layout.tsx
import React from 'react';
import './globals.css'; // Direct path to the css file in the same folder

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
    <html lang="en">
      <body className="bg-[#060913] min-h-screen text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
