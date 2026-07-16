'use client'

const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const GREEN = '#4ade80'
const PINK = '#f472b6'

const integrationCards = [
  {
    icon: '🔌',
    title: 'Provider action builder',
    description: 'Create reusable provider actions with backend-only credentials, request templates, and mapped responses.',
    accent: CYAN,
  },
  {
    icon: '🧩',
    title: 'Universal runner ready',
    description: 'Connect software APIs through the provider-neutral runner without rewriting the campaign engine or UI.',
    accent: GOLD,
  },
  {
    icon: '🛡️',
    title: 'Governed by default',
    description: 'Keep secrets server-side and preserve owner approval gates before sensitive live actions execute.',
    accent: GREEN,
  },
]

const workflowSteps = [
  'Choose a provider capability',
  'Map request and response fields',
  'Validate credentials server-side',
  'Route sensitive actions through approval',
]

export default function ToolBuilder() {
  return (
    <section style={{ padding: '56px 20px 76px' }}>
      <div style={{ width: 'min(1180px, 100%)', margin: '0 auto', display: 'grid', gap: 26 }}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid rgba(26,240,255,.20)',
            borderRadius: 28,
            padding: '34px clamp(22px, 4vw, 46px)',
            background: 'linear-gradient(135deg, rgba(3,7,18,.94), rgba(15,23,42,.78))',
            boxShadow: '0 28px 90px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        >
          <div aria-hidden style={{ position: 'absolute', inset: '-35% -10% auto auto', width: 420, height: 420, borderRadius: 999, background: 'radial-gradient(circle, rgba(26,240,255,.20), transparent 68%)', filter: 'blur(18px)' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 'auto auto -38% -8%', width: 360, height: 360, borderRadius: 999, background: 'radial-gradient(circle, rgba(255,195,0,.16), transparent 70%)', filter: 'blur(22px)' }} />

          <div style={{ position: 'relative', display: 'grid', gap: 18, maxWidth: 780 }}>
            <span style={{ color: GOLD, fontSize: 12, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase' }}>Integrations</span>
            <h1 style={{ margin: 0, color: '#fff', fontSize: 'clamp(34px, 6vw, 64px)', lineHeight: .95, letterSpacing: '-.05em' }}>Visual Tool Builder</h1>
            <p style={{ margin: 0, color: 'rgba(226,232,240,.78)', fontSize: 18, lineHeight: 1.65 }}>
              Build governed integration tools for SignalBoostAi workflows. This workspace is available only after login and is designed for connected providers, backend-only keys, and human approval gates.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {integrationCards.map((card) => (
            <article key={card.title} style={{ border: `1px solid ${card.accent}33`, borderRadius: 22, padding: 22, background: 'rgba(15,23,42,.72)', boxShadow: `0 0 32px ${card.accent}0f`, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
              <div style={{ fontSize: 30, marginBottom: 14 }}>{card.icon}</div>
              <h2 style={{ margin: '0 0 8px', color: '#fff', fontSize: 18 }}>{card.title}</h2>
              <p style={{ margin: 0, color: 'rgba(203,213,225,.72)', fontSize: 14, lineHeight: 1.6 }}>{card.description}</p>
            </article>
          ))}
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,.10)', borderRadius: 24, padding: 24, background: 'rgba(2,6,23,.64)' }}>
          <h2 style={{ margin: '0 0 18px', color: '#fff', fontSize: 22 }}>Builder workflow</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {workflowSteps.map((step, index) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(226,232,240,.86)' }}>
                <span style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', background: index % 2 ? `${PINK}22` : `${CYAN}22`, border: '1px solid rgba(255,255,255,.12)', color: index % 2 ? PINK : CYAN, fontWeight: 900 }}>{index + 1}</span>
                <span style={{ fontWeight: 750 }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
