'use client'

// saas/app/hub/vercel/page.tsx
// Standalone route for the Vercel Environment Variables workspace.
// Reachable at /hub/vercel. Gated to admins by app/hub/layout.tsx.

import EnvVarsPage from '@/components/hub/pages/EnvVarsPage'

export default function HubVercelEnvPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(1100px 500px at 80% -10%, rgba(26,240,255,.10), transparent 60%), radial-gradient(900px 480px at 0% 110%, rgba(255,195,0,.07), transparent 55%), linear-gradient(180deg, #0b1220 0%, #030712 100%)',
        color: '#fff',
        padding: '18px clamp(14px, 2vw, 42px) 40px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        overflowX: 'hidden',
      }}
    >
      <style>{`
        .hub-chip{transition:background .15s ease,color .15s ease,border-color .15s ease;cursor:pointer;}
        .hub-chip:hover{border-color:rgba(255,195,0,.6);}
      `}</style>

      <header
        style={{
          position: 'sticky', top: 0, zIndex: 25, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18,
          padding: '10px 0 14px',
          background: 'linear-gradient(180deg, rgba(11,18,32,.98), rgba(11,18,32,.72) 70%, transparent)',
          backdropFilter: 'blur(10px)',
          maxWidth: 1040, marginLeft: 'auto', marginRight: 'auto',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0, fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, letterSpacing: '-.03em',
              background: 'linear-gradient(90deg, #fff 30%, #1af0ff 75%, #ffc300 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}
          >
            Vercel · Environment Variables
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'rgba(255,255,255,.58)' }}>
            View, add, edit, and delete variables across Production, Preview, and Development.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/hub" className="hub-chip" style={{ padding: '8px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.72)', textDecoration: 'none', fontSize: 12.5, fontWeight: 800 }}>🛰️ Dashboard</a>
          <a href="/hub/providers" className="hub-chip" style={{ padding: '8px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.72)', textDecoration: 'none', fontSize: 12.5, fontWeight: 800 }}>🧭 Providers</a>
        </div>
      </header>

      <EnvVarsPage />
    </main>
  )
}
