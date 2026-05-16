import Navbar from '@/components/Navbar'
import SignalHero from '@/components/SignalHero'
import PodcastSection from '@/components/PodcastSection'

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f' }}>
      <Navbar />
      <SignalHero />
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <PodcastSection />
      </div>
    </main>
  )
}
