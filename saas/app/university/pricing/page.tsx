import type { Metadata } from 'next'
import UniversityPublicPage, { universityMetadata } from '@/components/seo/UniversityPublicPage'
export const metadata: Metadata = universityMetadata('en', true)
export default function UniversityPricing() { return <UniversityPublicPage locale="en" pricing /> }
