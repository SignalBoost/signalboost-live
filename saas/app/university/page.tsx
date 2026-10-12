import type { Metadata } from 'next'
import UniversityPublicPage, { universityMetadata } from '@/components/seo/UniversityPublicPage'
export const metadata: Metadata = universityMetadata('en')
export default function UniversityLanding() { return <UniversityPublicPage locale="en" /> }
