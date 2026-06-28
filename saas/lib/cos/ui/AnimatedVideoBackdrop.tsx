'use client'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'

export function AnimatedVideoBackdrop({ sceneIndex }: { sceneIndex: number }) {
  const story = ['Hook', 'Hero', 'Product', 'Proof', 'CTA']
  const active = sceneIndex % story.length
  const cards = [
    ['Niche', 'busy owners'],
    ['Hero', 'operator'],
    ['Format', '9:16 / 16:9'],
    ['CTA', 'site visit'],
  ]

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: .98 }}>
      <style>{`
        @keyframes cosFloatA { 0%{transform:translate3d(-12px,10px,0) scale(.96);opacity:.72} 50%{transform:translate3d(14px,-10px,0) scale(1.02);opacity:1} 100%{transform:translate3d(-12px,10px,0) scale(.96);opacity:.72} }
        @keyframes cosFloatB { 0%{transform:translate3d(18px,-8px,0) rotate(-2deg)} 50%{transform:translate3d(-10px,12px,0) rotate(2deg)} 100%{transform:translate3d(18px,-8px,0) rotate(-2deg)} }
        @keyframes cosScan { 0%{transform:translateX(-110%);opacity:0} 18%{opacity:.9} 70%{opacity:.45} 100%{transform:translateX(110%);opacity:0} }
        @keyframes cosPulse { 0%,100%{opacity:.45;transform:scale(.92)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes cosBar { 0%{width:16%} 50%{width:92%} 100%{width:42%} }
        @keyframes cosGlow { 0%,100%{box-shadow:0 0 20px rgba(255,195,0,.18)} 50%{box-shadow:0 0 42px rgba(26,240,255,.34)} }
        @media (prefers-reduced-motion: reduce) { .cos-video-anim { animation:none!important; } }
      `}</style>

      <span className="cos-video-anim" style={{ position: 'absolute', inset: '10% -20%', height: 3, background: `linear-gradient(90deg, transparent, ${CYAN}, ${GOLD}, transparent)`, animation: 'cosScan 4.5s linear infinite' }} />

      <div className="cos-video-anim" style={{ position: 'absolute', left: '5%', top: '13%', width: 250, minHeight: 250, borderRadius: 28, border: '1px solid rgba(255,195,0,.26)', background: 'linear-gradient(160deg, rgba(255,195,0,.14), rgba(2,6,23,.72))', animation: 'cosFloatA 6s ease-in-out infinite', padding: 18 }}>
        <div style={{ color: GOLD, fontSize: 10, fontWeight: 950, letterSpacing: '.16em', textTransform: 'uppercase' }}>COSA selected hero</div>
        <div style={{ width: 92, height: 92, borderRadius: 999, margin: '18px auto 12px', background: `radial-gradient(circle at 35% 28%, #fff, ${GOLD} 28%, rgba(255,195,0,.28) 55%, rgba(2,6,23,.9) 72%)`, border: '1px solid rgba(255,195,0,.45)', animation: 'cosGlow 3s ease-in-out infinite' }} />
        <div style={{ color: '#fff', fontWeight: 950, fontSize: 18, textAlign: 'center', lineHeight: 1.1 }}>Busy Owner</div>
        <div style={{ color: 'rgba(255,255,255,.64)', fontSize: 11, textAlign: 'center', marginTop: 8, lineHeight: 1.45 }}>From scattered work to one approved next step</div>
      </div>

      <div className="cos-video-anim" style={{ position: 'absolute', right: '5%', top: '14%', width: 300, padding: 14, borderRadius: 18, border: '1px solid rgba(26,240,255,.28)', background: 'rgba(2,6,23,.64)', animation: 'cosFloatB 7s ease-in-out infinite' }}>
        <div style={{ color: CYAN, fontSize: 10, fontWeight: 950, letterSpacing: '.14em', textTransform: 'uppercase' }}>Marketing decision engine</div>
        <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
          {story.map((label, index) => (
            <span key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#fff', fontSize: 11, border: index === active ? '1px solid rgba(255,195,0,.35)' : '1px solid rgba(255,255,255,.06)', borderRadius: 9, padding: '7px 8px', background: index === active ? 'rgba(255,195,0,.1)' : 'rgba(255,255,255,.035)' }}>
              <span>{label}</span>
              <strong style={{ color: index === active ? GOLD : 'rgba(255,255,255,.45)' }}>{index === active ? 'active' : 'ready'}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="cos-video-anim" style={{ position: 'absolute', right: '9%', bottom: '20%', width: 132, height: 132, borderRadius: 999, display: 'grid', placeItems: 'center', background: `conic-gradient(${GOLD} 0 78%, rgba(255,255,255,.14) 78% 100%)`, animation: 'cosPulse 3s ease-in-out infinite' }}>
        <div style={{ width: 104, height: 104, borderRadius: 999, background: 'rgba(2,6,23,.9)', display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: GOLD, fontSize: 26, fontWeight: 950 }}>78%</div>
            <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 10, textTransform: 'uppercase', fontWeight: 900 }}>fit score</div>
          </div>
        </div>
      </div>

      <div className="cos-video-anim" style={{ position: 'absolute', left: '27%', bottom: '16%', width: 390, padding: 12, borderRadius: 18, background: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.1)', animation: 'cosFloatB 7.5s ease-in-out infinite' }}>
        <div style={{ color: GOLD, fontSize: 10, fontWeight: 950, letterSpacing: '.12em', textTransform: 'uppercase' }}>Product story cards</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
          {cards.map(([title, body], index) => (
            <div key={title} style={{ borderRadius: 12, padding: 9, background: index === active % 4 ? 'rgba(255,195,0,.18)' : 'rgba(255,255,255,.055)', border: index === active % 4 ? '1px solid rgba(255,195,0,.35)' : '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ color: index === active % 4 ? GOLD : CYAN, fontSize: 10, fontWeight: 950 }}>{title}</div>
              <div style={{ color: '#fff', fontSize: 10, marginTop: 5, lineHeight: 1.25 }}>{body}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.12)', marginTop: 12, overflow: 'hidden' }}>
          <span className="cos-video-anim" style={{ display: 'block', height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${GOLD}, ${CYAN})`, animation: 'cosBar 5s ease-in-out infinite' }} />
        </div>
      </div>

      {[0, 1, 2, 3, 4].map((dot) => (
        <span key={dot} className="cos-video-anim" style={{ position: 'absolute', left: `${20 + dot * 14}%`, top: `${19 + (dot % 2) * 52}%`, width: 9, height: 9, borderRadius: 999, background: dot === active ? GOLD : CYAN, boxShadow: `0 0 24px ${dot === active ? GOLD : CYAN}`, animation: `cosPulse ${2.4 + dot * .35}s ease-in-out infinite` }} />
      ))}
    </div>
  )
}
