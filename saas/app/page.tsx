import SignalHero from '@/components/SignalHero'
import PodcastSection from '@/components/PodcastSection'

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
      }}
    >
      <SignalHero />

      <div
        style={{
          borderTop: '1px solid var(--border-soft)',
        }}
      >
        <PodcastSection />
      </div>
    </main>
  )
}
