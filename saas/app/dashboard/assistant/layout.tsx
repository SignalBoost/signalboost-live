import type { ReactNode } from 'react'
import AssistantSourceFileBoundary from '@/components/AssistantSourceFileBoundary'
import AssistantTransportBoundary from '@/components/AssistantTransportBoundary'

export default function AssistantLayout({ children }: { children: ReactNode }) {
  return (
    <AssistantSourceFileBoundary>
      <AssistantTransportBoundary>{children}</AssistantTransportBoundary>
    </AssistantSourceFileBoundary>
  )
}
