import type { ReactNode } from 'react'
import WebsiteOptimizerRepairStatus from '@/components/owner/WebsiteOptimizerRepairStatus'

export default function WebsiteOptimizerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WebsiteOptimizerRepairStatus />
      {children}
    </>
  )
}
