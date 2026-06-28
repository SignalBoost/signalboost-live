'use client'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

export function AnimatedVideoBackdrop({ sceneIndex }: { sceneIndex: number }) {
  const labels = ['Signals', 'Audience', 'Product', 'Result']
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: .95 }}>
      <style>{`
        @keyframes cosFloatA { 0%{transform:translate3d(-12px,10px,0) scale(.96);opacity:.62} 50%{transform:translate3d(14px,-10px,0) scale(1.02);opacity:1} 100%{transform:translate3d(-12px,10px,0) scale(.96);opacity:.62} }
        @keyframes cosFloatB { 0%{transform:translate3d(18px,-8px,0) rotate(-2deg)} 50%{transform:translate3d(-10px,12px,0) rotate(2deg)} 100%{transform:translate3d(18px,-8px,0) rotate(-2deg)} }
        @keyframes cosScan { 0%{transform:translateX(-110%);opacity:0} 18%{opacity:.8} 70%{opacity:.45} 100%{transform:translateX(110%);opacity:0} }
        @keyframes cosPulse { 0%,100%{opacity:.45;transform:scale(.92)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes cosBar { 0%{width:16%} 50%{width:86%} 100%{width:38%} }
        @media (prefers-reduced-motion: reduce) { .cos-video-anim { animation:none!important; } }
      `}</style>
      <span className="cos-video-anim" style={{ position: 'absolute', inset: '12% -20%', height: 3, background: `linear-gradient(90deg, transparent, ${CYAN}, ${GOLD}, transparent)`, animation: 'cosScan 4.5s linear infinite' }} />
      <div className="cos-video-anim" style={{ position: 'absolute', right: '7%', top: '18%', width: 260, padding: 14, borderRadius: 18, border: '1px solid rgba(26,240,255,.28)', background: 'rgba(2,6,23,.58)', animation: 'cosFloatA 6s ease-in-out infinite' }}>
        <div style={{ color: CYAN, fontSize: 10, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>Command Console</div>
        <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
          {labels.map((label, index) => (
            <span key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#fff', fontSize: 11 }}>
              <span>{label}</span>
              <strong style={{ color: index === sceneIndex % labels.length ? GOLD : 'rgba(255,255,255,.45)' }}>{index === sceneIndex % labels.length ? 'active' : 'ready'}</strong>
            </span>
          ))}
        </div>
      </div>
      <div className="cos-video-anim" style={{ position: 'absolute', left: '7%', bottom: '18%', width: 210, padding: 12, borderRadius: 16, background: 'rgba(255,195,0,.1)', border: '1px solid rgba(255,195,0,.22)', animation: 'cosFloatB 7s ease-in-out infinite' }}>
        <div style={{ color: GOLD, fontSize: 10, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Workflow</div>
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.12)', marginTop: 11, overflow: 'hidden' }}>
          <span className="cos-video-anim" style={{ display: 'block', height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${GOLD}, ${CYAN})`, animation: 'cosBar 5s ease-in-out infinite' }} />
        </div>
      </div>
      {[0, 1, 2, 3].map((dot) => (
        <span key={dot} className="cos-video-anim" style={{ position: 'absolute', left: `${22 + dot * 15}%`, top: `${22 + (dot % 2) * 46}%`, width: 10, height: 10, borderRadius: 999, background: dot === sceneIndex % 4 ? GOLD : CYAN, boxShadow: `0 0 24px ${dot === sceneIndex % 4 ? GOLD : CYAN}`, animation: `cosPulse ${2.4 + dot * .35}s ease-in-out infinite` }} />
      ))}
    </div>
  )
}
