import Header from '../components/Header'
import Hero from '../components/Hero'
import TrustSignals from '../components/TrustSignals'
import Metrics from '../components/Metrics'
import FeaturesFlow from '../components/FeaturesFlow'
import Footer from '../components/Footer'

export default function Page() {
  return (
    <main className="bg-black min-h-screen">
      <Header />
      <Hero />
      <TrustSignals />
      <Metrics />
      <FeaturesFlow />
      <Footer />
    </main>
  )
}
