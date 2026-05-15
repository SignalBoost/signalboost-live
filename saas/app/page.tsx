// saas/app/page.tsx
import Header from '@/components/Header'
import Hero from '@/components/Hero'
import TrustSignals from '@/components/TrustSignals'
import Metrics from '@/components/Metrics'
import FeaturesFlow from '@/components/FeaturesFlow'
import Testimonials from '@/components/Testimonials'
import Footer from '@/components/Footer'

export default function HomePage() {
  return (
    <>
      <Header />
      <Hero />
      <TrustSignals />
      <Metrics />
      <FeaturesFlow />
      <Testimonials />
      <Footer />
    </>
  )
}
