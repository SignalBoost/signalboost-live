import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SignalBoost Staging QA',
  description: 'Temporary staging deployment brief for SignalBoost SaaS testing.',
}

export default function StagingLayout({ children }: { children: React.ReactNode }) {
  return children
}
