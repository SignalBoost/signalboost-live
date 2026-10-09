// saas/components/Navbar.tsx
'use client'
import { usePathname } from 'next/navigation'
import { publicLocaleFromPath } from '@/lib/seo/publicLocales.ts'
import LocalizedPublicNavbar from './seo/LocalizedPublicNavbar.tsx'
import PremiumCustomerNavbarV2 from './PremiumCustomerNavbarV2.tsx'
import PublicServiceWindowNav from './PublicServiceWindowNav.tsx'

export default function Navbar() {
  const locale = publicLocaleFromPath(usePathname())
  if (locale) return <LocalizedPublicNavbar locale={locale} />
  return (
    <>
      <PremiumCustomerNavbarV2 />
      <PublicServiceWindowNav />
    </>
  )
}
