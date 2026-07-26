// saas/components/Navbar.tsx
'use client'

import PremiumCustomerNavbarV2 from './PremiumCustomerNavbarV2.tsx'
import PublicServiceWindowNav from './PublicServiceWindowNav.tsx'

export default function Navbar() {
  return (
    <>
      <PremiumCustomerNavbarV2 />
      <PublicServiceWindowNav />
    </>
  )
}
