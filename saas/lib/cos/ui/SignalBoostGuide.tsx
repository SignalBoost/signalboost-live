'use client'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

export function SignalBoostGuide({ active = false, label = 'SignalBoost AI' }: { active?: boolean; label?: string }) {
  return (
    <div aria-label={label} style={{ position: 'relative', width: 278, minHeight: 284 }}>
      <style>{`
        @keyframes sbGuideFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes sbGuideWave { 0%,100%{transform:rotate(-18deg)} 50%{transform:rotate(22deg)} }
        @keyframes sbGuidePulse { 0%,100%{opacity:.45;transform:scale(.96)} 50%{opacity:1;transform:scale(1.04)} }
        @keyframes sbGuideTalk { 0%,100%{transform:scaleX(1);opacity:.75} 50%{transform:scaleX(.58);opacity:1} }
      `}</style>

      <div style={{ position: 'absolute', left: 124, top: 6, width: 144, padding: 12, borderRadius: '18px 18px 18px 4px', background: 'rgba(2,6,23,.9)', border: '1px solid rgba(255,195,0,.38)', boxShadow: '0 0 36px rgba(255,195,0,.16)' }}>
        <div style={{ color: GOLD, fontWeight: 950, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Hi, I am</div>
        <div style={{ color: '#fff', fontWeight: 950, fontSize: 20, marginTop: 2 }}>{label}</div>
      </div>

      <div style={{ position: 'absolute', left: 16, top: 20, width: 180, height: 230, borderRadius: 34, background: 'radial-gradient(circle at 50% 0%, rgba(255,195,0,.24), rgba(15,23,42,.84) 54%, rgba(2,6,23,.96))', border: '1px solid rgba(255,195,0,.28)', boxShadow: '0 0 60px rgba(255,195,0,.18)' }} />

      <div style={{ position: 'absolute', left: 48, top: 24, animation: active ? 'sbGuideFloat 3s ease-in-out infinite' : 'none' }}>
        <div style={{ position: 'relative', width: 118, height: 118, borderRadius: 999, background: `radial-gradient(circle at 35% 28%, #fff 0 9%, ${GOLD} 10% 28%, rgba(255,195,0,.38) 29% 58%, rgba(2,6,23,.96) 59%)`, border: '1px solid rgba(255,195,0,.58)', boxShadow: '0 0 48px rgba(255,195,0,.24)' }}>
          <span style={{ position: 'absolute', left: 34, top: 43, width: 12, height: 12, borderRadius: 999, background: CYAN, boxShadow: `0 0 14px ${CYAN}` }} />
          <span style={{ position: 'absolute', right: 34, top: 43, width: 12, height: 12, borderRadius: 999, background: CYAN, boxShadow: `0 0 14px ${CYAN}` }} />
          <span style={{ position: 'absolute', left: '50%', top: 76, transform: 'translateX(-50%)', width: 34, height: 7, borderRadius: 999, background: '#020617', border: '1px solid rgba(255,255,255,.32)', animation: active ? 'sbGuideTalk .55s ease-in-out infinite' : 'none' }} />
        </div>

        <div style={{ position: 'absolute', left: 25, top: 112, width: 68, height: 86, borderRadius: '28px 28px 18px 18px', background: 'linear-gradient(180deg, rgba(255,195,0,.88), rgba(255,195,0,.26))', border: '1px solid rgba(255,195,0,.42)' }} />
        <div style={{ position: 'absolute', left: -8, top: 128, width: 52, height: 12, borderRadius: 999, background: GOLD, transformOrigin: 'right center', transform: 'rotate(-22deg)' }} />
        <div style={{ position: 'absolute', right: -8, top: 128, width: 54, height: 12, borderRadius: 999, background: GOLD, transformOrigin: 'left center', animation: active ? 'sbGuideWave 1.2s ease-in-out infinite' : 'none' }} />
        <div style={{ position: 'absolute', left: 8, top: 192, width: 34, height: 12, borderRadius: 999, background: CYAN, opacity: .85 }} />
        <div style={{ position: 'absolute', left: 74, top: 192, width: 34, height: 12, borderRadius: 999, background: CYAN, opacity: .85 }} />
      </div>

      <div style={{ position: 'absolute', left: 28, bottom: 0, width: 158, borderRadius: 18, padding: 10, background: 'rgba(2,6,23,.9)', border: '1px solid rgba(255,195,0,.28)', textAlign: 'center' }}>
        <div style={{ color: GOLD, fontWeight: 950, fontSize: 16 }}>{label}</div>
        <div style={{ color: 'rgba(255,255,255,.66)', fontSize: 11, marginTop: 4 }}>official platform guide</div>
      </div>

      <span style={{ position: 'absolute', left: 10, top: 24, width: 12, height: 12, borderRadius: 999, background: CYAN, animation: active ? 'sbGuidePulse 1.8s ease-in-out infinite' : 'none' }} />
      <span style={{ position: 'absolute', right: 12, top: 96, width: 8, height: 8, borderRadius: 999, background: GOLD, animation: active ? 'sbGuidePulse 2.1s ease-in-out infinite' : 'none' }} />
    </div>
  )
}
