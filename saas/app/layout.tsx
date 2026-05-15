// saas/app/layout.tsx
import React from 'react';
import './globals.css'; // Direct relative resolution inside the app directory

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
      <body>
        {children}
      </body>
    </html>
  );
}
