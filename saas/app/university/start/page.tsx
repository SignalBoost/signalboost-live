import type { Metadata } from 'next'
import Link from 'next/link'
import UniversityCustomerAccess from './UniversityCustomerAccess'
import LabCustomerTrainingSection from '@/app/dashboard/cos-university-telemetry/LabCustomerTrainingSection'

export const metadata: Metadata = {
  title: 'Start — iTMounts AI University',
  robots: { index: false, follow: false },
}
export default function UniversityStartPage() {
  return <main className="mx-auto max-w-6xl px-5 py-10 text-white sm:px-8">
    <nav aria-label="AI University navigation" className="mb-7 flex flex-wrap items-center gap-4 border-b border-white/20 pb-5 text-sm"><Link href="/university" className="font-semibold text-amber-300">iTMounts AI University</Link><Link href="/university/pricing" className="underline">Credits & pricing</Link><Link href="/support" className="underline">Help</Link></nav>
    <h1 className="mb-3 mt-6 text-3xl font-bold">Your AI University LAB</h1>
    <p className="mb-8 max-w-3xl text-slate-300">Create a workspace, connect supported tools, review your budget and manage training without accessing the platform's internal University administration.</p>
    <UniversityCustomerAccess><LabCustomerTrainingSection language="en" /></UniversityCustomerAccess>
    <footer className="mt-12 flex flex-wrap gap-5 border-t border-white/15 pt-5 text-xs text-slate-400"><Link href="/support" className="underline">Support</Link><Link href="/privacy" className="underline">Privacy</Link><Link href="/terms" className="underline">Terms</Link></footer>
  </main>
}
