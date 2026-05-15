// saas/app/layout.tsx
import React from 'react';
import './globals.css'; // This points directly to the file in the same folder

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
