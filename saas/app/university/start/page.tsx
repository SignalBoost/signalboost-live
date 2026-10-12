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
    <Link href="/university" className="text-sm text-amber-300 underline">← AI University</Link>
    <h1 className="mb-3 mt-6 text-3xl font-bold">Your AI University LAB</h1>
    <p className="mb-8 max-w-3xl text-slate-300">Create a workspace, connect supported tools, review your budget and manage training without accessing the platform's internal University administration.</p>
    <UniversityCustomerAccess><LabCustomerTrainingSection language="en" /></UniversityCustomerAccess>
  </main>
}
