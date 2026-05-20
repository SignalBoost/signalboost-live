'use client'
import Link from 'next/link'
import { useState } from 'react'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

const CONTACT_EMAIL = 'cadomos@gmail.com'

const SECTIONS = [
  {
    id: 'how-it-works',
    icon: '⚡',
    title: 'How SignalBoost works',
    content: [
      {
        q: 'What is SignalBoost?',
        a: 'SignalBoost is a multilingual content platform. We help businesses build websites, collect customer reviews, produce native audio and video content, and reach global audiences in 5 languages: English, Portuguese, Spanish, Polish and Russian. We are not a translation service — we create native content that sounds and reads like it was made by a local.'
      },
      {
        q: 'Who is SignalBoost for?',
        a: 'Anyone who wants to reach an international audience. From a bakery in Lisbon that wants a website in Portuguese and English, to a podcast network that wants to reach listeners in Brazil, Poland and Russia. We serve both complete beginners and technical developers — the experience adapts to your level.'
      },
      {
        q: 'What does SignalBoost NOT do?',
        a: 'We do not do hardware or recording equipment. We do not edit raw audio (removing background noise, cutting mistakes). We do not host podcast RSS feeds or submit to Spotify/Apple Podcasts. We do not produce music or intros. We are honest about our limits.'
      },
      {
        q: 'How does the AI work?',
        a: 'SignalBoost uses AI to generate native voiceover, captions, social clips, show notes, website content and more. Our AI support agent monitors your activity and proactively helps when it detects you are stuck — without you having to ask. If the AI cannot solve something, it brings in additional AI support silently, then escalates to Luis (our founder) if still unresolved.'
      },
    ]
  },
  {
    id: 'partners',
    icon: '🤝',
    title: 'Our partners — full transparency',
    content: [
      {
        q: 'Why does SignalBoost recommend certain providers?',
        a: 'We recommend providers based on quality, reliability and value. We have tested all of them. Some of our recommendations include affiliate links — meaning SignalBoost earns a commission if you sign up through our link, at no extra cost to you. We always disclose this clearly.'
      },
      {
        q: 'Which providers do you recommend and why?',
        a: 'Domain names: Namecheap (best value, easy DNS), Cloudflare (at-cost pricing, free SSL). Hosting: Vercel (best performance, free tier), Netlify (great for static sites). Audio AI: ElevenLabs (most natural voices available). We do not recommend providers we have not tested ourselves.'
      },
      {
        q: 'Do partner commissions affect your recommendations?',
        a: 'No. We list Cloudflare as a domain option even though they do not pay commissions, because they are genuinely good. If a provider becomes worse than their competitors we will say so and remove them from our recommendations, regardless of commission. Our users trust matters more than commission income.'
      },
      {
        q: 'Can SignalBoost get a partnership deal that benefits me?',
        a: 'Yes — we actively seek partnerships that give SignalBoost users discounts or extended trials. If we secure a deal, we pass the benefit to you. Check our pricing page for current partner benefits.'
      },
    ]
  },
  {
    id: 'your-data',
    icon: '🔒',
    title: 'Your data and privacy',
    content: [
      {
        q: 'Where is my data stored?',
        a: 'Your account data and project metadata are stored in Supabase — a secure, open-source database platform hosted on AWS. Your audio and video files are stored in Supabase Storage. Your site files are deployed via Vercel. We do not store your API keys in plain text — they are encrypted at rest.'
      },
      {
        q: 'Who can see my data?',
        a: 'Only you can see your projects and files. Luis (founder) has admin access for support purposes only and does not access user data unless you request help. We do not sell your data to anyone. We do not share it with third parties except the infrastructure providers listed above.'
      },
      {
        q: 'What happens if I cancel?',
        a: 'You keep access until the end of your billing period. After that your data is kept for 30 days in case you want to return. After 30 days it is permanently deleted. You can request immediate deletion at any time by opening a support ticket from this page.'
      },
      {
        q: 'How do I delete my account?',
        a: 'Open a support ticket from this page with the subject "Delete my account" sent from your registered email address. We will delete everything within 48 hours and confirm when done. No questions asked.'
      },
    ]
  },
  {
    id: 'ai-support',
    icon: '🤖',
    title: 'AI support — how it works',
    content: [
      {
        q: 'How does the AI support system work?',
        a: 'SignalBoost monitors your activity in real time. If you spend more than 3 minutes on the same page, click repeatedly without progress, or encounter an error — the AI proactively opens and offers help. It already knows your account, your plan, your current page, and what went wrong. You never have to explain your situation from scratch.'
      },
      {
        q: 'What happens when the AI cannot solve my problem?',
        a: 'The AI escalates seamlessly. First it brings in additional AI reasoning to analyze the problem from a different angle. The two AIs work together silently and present you with a combined solution. If still unresolved, Luis is notified automatically with the full conversation context and will respond personally.'
      },
      {
        q: 'What can the AI NOT do?',
        a: 'The AI cannot make purchasing decisions for you, access your bank or credit card, submit things on your behalf to third-party services, or guarantee resolution of issues caused by third-party providers (like Vercel outages or Namecheap DNS delays). In these cases it will explain clearly what is happening and what you need to do.'
      },
      {
        q: 'Is my support conversation private?',
        a: 'Yes. Your support conversations are private and only visible to you and SignalBoost support (Luis). They are not used to train AI models. Conversations are kept for 90 days for quality purposes then deleted.'
      },
    ]
  },
  {
    id: 'pricing',
    icon: '💳',
    title: 'Plans, pricing and storage',
    content: [
      {
        q: 'What are the plan limits?',
        a: 'Free: 3 projects, 1 language, 100MB storage. Starter ($10/mo): 10 projects, 2 languages, 1GB. Pro ($30/mo): 30 projects, all 5 languages, 10GB, video editor. Business ($90/mo): unlimited projects, 50GB. Podcast plans are separate — see the Podcasters page for details.'
      },
      {
        q: 'Do business partners get a free trial?',
        a: 'Yes — business partners get 30 days free on the Starter plan only. This gives you access to 2 languages, review collector, and native audio to try the platform. If you need Pro or Business features, those plans require payment from day one.'
      },
      {
        q: 'Why are there project and storage limits?',
        a: 'Storage costs money. Audio and video files can be large — a 10-minute podcast episode can be 50-100MB. Without limits a small number of heavy users would make the platform unaffordable for everyone else. The limits are designed so the free plan covers most people getting started, and paid plans cover professional use.'
      },
      {
        q: 'What happens when I reach my limit?',
        a: 'You will see a clear warning before you hit the limit. When you reach it, you cannot create new projects until you either delete an existing one or upgrade. We never delete your data or lock you out — we just pause new creation until resolved.'
      },
      {
        q: 'How do I cancel?',
        a: 'Cancel anytime from your dashboard under Settings, or open a support ticket from this page. No cancellation fees. You keep access until the end of your billing period. We do not make cancellation difficult on purpose — if you want to leave, we make it easy.'
      },
    ]
  },
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting started guides',
    content: [
      {
        q: 'How do I build my first website?',
        a: 'Go to Dashboard and click Site builder. If you are a beginner, the AI will guide you through the process conversationally — just tell it about your business. If you are technical, you can use the full builder directly. Either way, the AI is there to help at every step.'
      },
      {
        q: 'How do I set up a podcast?',
        a: 'Go to the Podcasters page and pick a plan. Once subscribed, go to Dashboard, then Native audio, then upload your episode. We support MP3, MP4, WAV and more. Important: bring us your finished, edited episode. We do not do raw audio editing. We generate voiceover, captions, clips and show notes from your final file.'
      },
      {
        q: 'How do I collect reviews?',
        a: 'Go to Dashboard then Review collector. You will get a review link to share with your customers. Reviews appear in your chosen languages automatically. You can embed the review widget on your SignalBoost site or any external site.'
      },
      {
        q: 'How do I connect my own domain?',
        a: 'Go through the onboarding wizard or go to Dashboard, then Settings, then Domain. You will need to update your DNS records at your domain provider to point to SignalBoost. The AI will give you the exact records to copy. DNS changes take 15 minutes to 48 hours to propagate worldwide.'
      },
    ]
  },
]

export default function DocsPage() {
  const [search, setSearch] = useState('')
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [openQ, setOpenQ] = useState<string | null>(null)

  const filtered = SECTIONS.map(s => ({
    ...s,
    content: s.content.filter(c =>
      c.q.toLowerCase().includes(search.toLowerCase()) ||
      c.a.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(s => s.content.length > 0)

  return (
    <main style={{ minHeight: '100vh', background: '#1e1e2e', color: '#fff', fontFamily: 'system-ui' }}>

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '60px 24px 32px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)', borderRadius: 999, padding: '4px 16px', marginBottom: 24, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: GOLD }}>
          Documentation
        </div>
        <div style={{ position: 'relative', maxWidth: 480, margin: '0 auto' }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search docs..."
            style={{ width: '100%', padding: '13px 16px 13px 44px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 15, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
        </div>
      </section>

      {!search && (
        <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, textDecoration: 'none', color: '#fff', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{s.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 80px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)', fontSize: 15 }}>
            No results for "{search}"
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {filtered.map(section => (
              <div key={section.id} id={section.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, cursor: 'pointer' }}
                  onClick={() => setOpenSection(openSection === section.id ? null : section.id)}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    {section.icon}
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, flex: 1 }}>{section.title}</h2>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>{openSection === section.id ? '−' : '+'}</span>
                </div>
                {(openSection === section.id || search) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 52 }}>
                    {section.content.map(item => (
                      <div key={item.q} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
                        <div onClick={() => setOpenQ(openQ === item.q ? null : item.q)}
                          style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{item.q}</span>
                          <span style={{ color: BLUE, fontSize: 16, flexShrink: 0 }}>{openQ === item.q ? '−' : '+'}</span>
                        </div>
                        {(openQ === item.q || search) && (
                          <div style={{ padding: '0 18px 16px', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ paddingTop: 12 }}>{item.a}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ maxWidth: 600, margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '40px 32px' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>💬</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>Still have a question?</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
            Open a support ticket. Every question that is not answered in the docs gets added here so the next person does not have to ask.
          </p>
          <a href={`mailto:${CONTACT_EMAIL}?subject=SignalBoost%20Question`}
            style={{ background: GOLD, color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 32px', borderRadius: 999, textDecoration: 'none', display: 'inline-block' }}>
            Open a support ticket
          </a>
        </div>
      </section>

    </main>
  )
}
