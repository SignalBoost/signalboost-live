import Navbar from '@/components/Navbar'

export default function OfflinePage() {
  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>
      <Navbar />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 65px)', textAlign: 'center', padding: '32px' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>📡</div>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>No signal</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, maxWidth: 320, lineHeight: 1.6 }}>
          You appear to be offline. Check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 32, background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 32px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
          Try again
        </button>
      </div>
    </main>
  )
}
