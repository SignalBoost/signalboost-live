// saas/app/m/[id]/PublicCampaign.tsx
'use client'
import { useState } from 'react'

type Draft = { lang: string; title: string; body: string }

export default function PublicCampaign({ drafts }: { drafts: Draft[] }) {
  const langs = drafts.map((d) => d.lang)
  const [lang, setLang] = useState(langs.includes('en') ? 'en' : (langs[0] || 'en'))
  const d = drafts.find((x) => x.lang === lang) || drafts[0]
  return (
    <main style={{ minHeight: '70vh', maxWidth: 720, margin: '0 auto', padding: '48px 22px', color: 'rgba(226,232,240,.92)' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {drafts.map((x) => (
          <button key={x.lang} onClick={() => setLang(x.lang)}
            style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${x.lang === lang ? '#1af0ff' : 'rgba(255,255,255,.18)'}`,
              background: x.lang === lang ? 'rgba(26,240,255,.12)' : 'transparent',
              color: x.lang === lang ? '#1af0ff' : 'rgba(226,232,240,.7)' }}>
            {x.lang}
          </button>
        ))}
      </div>
      {d ? (
        <article>
          <h1 className="sb-h2" style={{ margin: '0 0 14px' }}>{d.title}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{d.body}</p>
        </article>
      ) : null}
    </main>
  )
}
