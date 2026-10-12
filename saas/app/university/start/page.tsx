import type { Metadata } from 'next'
import UniversityStartContent from './UniversityStartContent'
export const metadata: Metadata = { title: 'Start — iTMounts AI University', robots: { index: false, follow: false } }
export default function UniversityStartPage() { return <UniversityStartContent locale="en" /> }
