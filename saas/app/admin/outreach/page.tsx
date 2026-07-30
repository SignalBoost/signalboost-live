import Link from 'next/link'
import AdmConsoleClient from '@/components/admin/outreach/AdmConsoleClient'

export default function OutreachAdminPage() {
  return (
    <main style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Link href="/admin/outreach/delivery" className="sb-button-secondary">📬 Resend</Link>
      </div>
      <AdmConsoleClient />
    </main>
  )
}
