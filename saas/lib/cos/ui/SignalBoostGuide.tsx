'use client'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

export function SignalBoostGuide({ active = false, label = 'SignalBoost AI' }: { active?: boolean; label?: string }) {
  return (
    <div aria-label={label} style={{ position: 'relative', width: 154, minHeight: 188 }}>
      <style>{`
        @keyframes sbGuideFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes sbGuideWave { 0%,100%{transform:rotate(-12deg)} 50%{transform:rotate(18deg)} }
        @keyframes sbGuidePulse { 0%,100%{opacity:.45;transform:scale(.96)} 50%{opacity:1;transform:scale(1.04)} }
      `}</style>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 28, background: 'radial-gradient(circle at 50% 18%, rgba(255,195,0,.22), transparent 42%)', filter: 'blur(2px)' }} />
      <div style={{ position: 'relative', animation: active ? 'sbGuideFloat 3s ease-in-out infinite' : 'none' }}>
        <div style={{ width: 122, height: 122, borderRadius: 999, margin: '0 auto', background: `radial-gradient(circle at 35% 28%, #fff 0 9%, ${GOLD} 10% 28%, rgba(255,195,0,.38) 29% 58%, rgba(2,6,23,.96) 59%)`, border: '1px solid rgba(255,195,0,.58)', boxShadow: '0 0 48px rgba(255,195,0,.22)' }}>
          <span style={{ position: 'absolute', left: 51, top: 46, width: 10, height: 10, borderRadius: 999, background: CYAN, boxShadow: `0 0 14px ${CYAN}` }} />
          <span style={{ position: 'absolute', right: 51, top: 46, width: 10, height: 10, borderRadius: 999, background: CYAN, boxShadow: `0 0 14px ${CYAN}` }} />
          <span style={{ position: 'absolute', left: '50%', top: 78, transform: 'translateX(-50%)', width: 30, height: 6, borderRadius: 999, background: '#020617', border: '1px solid rgba(255,255,255,.32)' }} />
        </div>
        <div style={{ position: 'absolute', right: 6, top: 82, width: 34, height: 12, borderRadius: 999, background: GOLD, transformOrigin: 'left center', animation: active ? 'sbGuideWave 1.2s ease-in-out infinite' : 'none' }} />
        <div style={{ margin: '12px auto 0', width: 124, borderRadius: 18, padding: 10, background: 'rgba(2,6,23,.78)', border: '1px solid rgba(255,195,0,.28)', textAlign: 'center' }}>
          <div style={{ color: GOLD, fontWeight: 950, fontSize: 14 }}>{label}</div>
          <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 10, marginTop: 4 }}>platform guide</div>
        </div>
      </div>
      <span style={{ position: 'absolute', left: 8, top: 18, width: 12, height: 12, borderRadius: 999, background: CYAN, animation: active ? 'sbGuidePulse 1.8s ease-in-out infinite' : 'none' }} />
      <span style={{ position: 'absolute', right: 2, top: 34, width: 8, height: 8, borderRadius: 999, background: GOLD, animation: active ? 'sbGuidePulse 2.1s ease-in-out infinite' : 'none' }} />
    </div>
  )
}
