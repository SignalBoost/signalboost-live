// saas/app/dashboard/layout.tsx
import React from 'react';
import DashboardLayout from '@/saas/components/DashboardLayout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
