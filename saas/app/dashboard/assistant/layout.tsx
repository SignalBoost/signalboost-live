import type { ReactNode } from 'react'
import AssistantTransportBoundary from '@/components/AssistantTransportBoundary'

export default function AssistantLayout({ children }: { children: ReactNode }) {
  return <AssistantTransportBoundary>{children}</AssistantTransportBoundary>
}
