import CybersecurityRepairStatus from '@/components/owner/CybersecurityRepairStatus'

export default function CybersecurityCheckLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CybersecurityRepairStatus />
      {children}
    </>
  )
}
