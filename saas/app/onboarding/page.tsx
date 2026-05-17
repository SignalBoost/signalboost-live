'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase/client'

const STEPS = [
  { id: 'welcome',    title: 'Welcome',         icon: '👋' },
  { id: 'experience', title: 'Your experience', icon: '🎯' },
  { id: 'goal',       title: 'Your goal',       icon: '🚀' },
  { id: 'domain',     title: 'Domain name',     icon: '🌐' },
  { id: 'hosting',    title: 'Hosting',         icon: '⚡' },
  { id: 'keys',       title: 'Connect accounts',icon: '🔑' },
  { id: 'business',   title: 'Your business',   icon: '🏪' },
  { id: 'ready',      title: 'Ready to build',  icon: '🎉' },
]

const PARTNERS = {
  domain: [
    { name: 'Namecheap',  url: 'https://namecheap.com',  price: 'From $8.99/yr',   recommended: true,  desc: 'Best value for domains. Easy DNS management.' },
    { name: 'GoDaddy',    url: 'https://godaddy.com',    price: 'From $9.99/yr',   recommended: false, desc: 'Largest domain registrar worldwide.' },
    { name: 'Cloudflare', url: 'https://cloudflare.com', price: 'At cost pricing', recommended: false, desc: 'No markup on domains. Free SSL and CDN included.' },
  ],
  hosting: [
    { name: 'Vercel',    url: 'https://vercel.com',    price: 'Free to start', recommended: true,  desc: 'Best performance. Free tier available. Easy setup.' },
    { name: 'Netlify',   url: 'https://netlify.com',   price: 'Free to start', recommended: false, desc: 'Great for static sites. Generous free tier.' },
    { name: 'Hostinger', url: 'https://hostinger.com', price: 'From $2.99/mo', recommended: false, desc: 'Affordable. Good for beginners.' },
  ],
}

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [checking, setChecking] = useState(true)
  const [answers, setAnswers] = useState({
    experience: '', goal: '', businessName: '', businessType: '',
    businessDesc: '', languages: [] as string[],
    domainProvider: '', domainName: '', hostingProvider: '',
    vercelToken: '', githubToken: '',
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { router.push('/'); return }

      const meta = data.user.user_metadata
      const fullName = meta?.full_name || meta?.name || ''
      setFirstName(fullName.split(' ')[0] || 'there')

      // Check if already onboarded — if yes skip to dashboard
      supabase.from('profiles').select('onboarded').eq('id', data.user.id).single()
        .then(({ data: profile, error }) => {
          if (error || !profile?.onboarded) {
            setChecking(false)
          } else {
            router.push('/dashboard')
          }
        })
    })
  }, [])

  async function finish() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').upsert({
      id: user.id,
      onboarded: true,
      experience: answers.experience,
      goal: answers.goal,
      business_name: answers.businessName,
      business_type: answers.businessType,
      preferred_languages: answers.languages,
    })
    router.push('/dashboard')
  }

  async function skip() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').upsert({ id: user.id, onboarded: true })
    }
    router.push('/dashboard')
  }

  if (checking) {
    return (
      <main style={{ minHeight: '100vh', background: '#1e1e2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</div>
      </main>
    )
  }

  const progress = (step / (STEPS.length - 1)) * 100

  return (
    <main style={{ minHeight: '100vh', background: '#1e1e2e', color: '#fff', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>

      {/* Progress bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', zIndex: 100 }}>
        <div style={{ height: '100%', background: `linear-gradient(90deg, ${BLUE}, ${GOLD})`, width: `${progress}%`, transition: 'width 0.4s ease' }} />
      </div>

      {/* Logo */}
      <div style={{ position: 'fixed', top: 20, left: 32, fontSize: 17, fontWeight: 800 }}>
        signal<span style={{ color: GOLD }}>boost</span>
      </div>

      {/* Skip button — always visible */}
      <button onClick={skip}
        style={{ position: 'fixed', top: 16, right: 32, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '8px 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', zIndex: 100 }}>
        Skip to dashboard →
      </button>

      {/* Step indicator */}
      <div style={{ position: 'fixed', top: 56, right: 32, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
        {step + 1} of {STEPS.length}
      </div>

      <div style={{ width: '100%', maxWidth: 600, animation: 'fadeIn 0.3s ease-out' }}>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* STEP 0 — Welcome */}
        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>👋</div>
            <h1 style={{ fontSize: 36, fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
              Welcome to SignalBoost,<br />
              <span style={{ color: GOLD }}>{firstName}!</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, lineHeight: 1.7, maxWidth: 480, margin: '0 auto 24px' }}>
              We have a few optional questions to help set up your perfect experience. You can skip any step or go straight to your dashboard.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, marginBottom: 40 }}>
              Nothing here is mandatory — we just want to help you faster.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setStep(1)}
                style={{ background: GOLD, color: '#000', fontWeight: 800, fontSize: 16, padding: '14px 48px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Let's get started →
              </button>
              <button onClick={skip}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '14px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                Skip to dashboard
              </button>
            </div>
          </div>
        )}

        {/* STEP 1 — Experience */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Optional</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 32px', letterSpacing: '-0.02em' }}>How would you describe yourself?</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
              {[
                { value: 'beginner',  icon: '🙋', title: 'Complete beginner',  desc: 'I have never built a website before. Guide me through everything.' },
                { value: 'some',      icon: '📚', title: 'Some experience',    desc: 'I have tried website builders before but need help with technical parts.' },
                { value: 'technical', icon: '👨‍💻', title: 'Technical user',     desc: 'I am comfortable with code and just need the platform tools.' },
              ].map(opt => (
                <div key={opt.value} onClick={() => setAnswers(a => ({ ...a, experience: opt.value }))}
                  style={{ padding: '20px 24px', borderRadius: 16, cursor: 'pointer', background: answers.experience === opt.value ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${answers.experience === opt.value ? BLUE : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{opt.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{opt.title}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{opt.desc}</div>
                  </div>
                  {answers.experience === opt.value && <span style={{ marginLeft: 'auto', color: BLUE, fontSize: 20 }}>✓</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setStep(0)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(2)} style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                {answers.experience ? 'Continue →' : 'Skip this step →'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — Goal */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Optional</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 32px', letterSpacing: '-0.02em' }}>What do you want to build?</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 40 }}>
              {[
                { value: 'website',  icon: '🌐', title: 'A website',       desc: 'For my business, portfolio or personal brand' },
                { value: 'podcast',  icon: '🎙️', title: 'A podcast',       desc: 'Reach listeners in multiple languages' },
                { value: 'reviews',  icon: '⭐', title: 'Collect reviews',  desc: 'Build trust with customer testimonials' },
                { value: 'video',    icon: '🎬', title: 'Video content',    desc: 'Create multilingual videos and social clips' },
                { value: 'all',      icon: '🚀', title: 'All of the above', desc: 'I want the full SignalBoost experience' },
                { value: 'unsure',   icon: '🤔', title: 'Not sure yet',     desc: 'Help me figure out what I need' },
              ].map(opt => (
                <div key={opt.value} onClick={() => setAnswers(a => ({ ...a, goal: opt.value }))}
                  style={{ padding: '18px 20px', borderRadius: 14, cursor: 'pointer', background: answers.goal === opt.value ? 'rgba(255,195,0,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${answers.goal === opt.value ? GOLD : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 24, display: 'block', marginBottom: 8 }}>{opt.icon}</span>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{opt.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{opt.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setStep(1)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                {answers.goal ? 'Continue →' : 'Skip this step →'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Domain */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Optional</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>What is your website address?</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 20 }}>Your domain name — like <strong style={{ color: '#fff' }}>mybakery.com</strong>. You can skip this and add it later.</p>
            <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              💡 <strong style={{ color: GOLD }}>Transparency:</strong> SignalBoost may earn a commission if you sign up through these links, at no extra cost to you.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {PARTNERS.domain.map(p => (
                <div key={p.name} onClick={() => setAnswers(a => ({ ...a, domainProvider: p.name }))}
                  style={{ padding: '16px 20px', borderRadius: 14, cursor: 'pointer', background: answers.domainProvider === p.name ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${answers.domainProvider === p.name ? BLUE : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                      {p.recommended && <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 999, padding: '1px 8px' }}>Recommended</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{p.desc}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>{p.price}</div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: BLUE, textDecoration: 'none' }}>Visit site →</a>
                  </div>
                  {answers.domainProvider === p.name && <span style={{ color: BLUE, fontSize: 20 }}>✓</span>}
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8 }}>Already have a domain? Enter it here (optional):</label>
              <input placeholder="e.g. mybakery.com" value={answers.domainName} onChange={e => setAnswers(a => ({ ...a, domainName: e.target.value }))}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setStep(2)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(4)} style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>Continue →</button>
              <button onClick={() => setStep(4)} style={{ background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>Skip →</button>
            </div>
          </div>
        )}

        {/* STEP 4 — Hosting */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Optional</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Where should your site live?</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 20 }}>Hosting is where your website files are stored. You can skip this and set it up later.</p>
            <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              💡 <strong style={{ color: GOLD }}>Transparency:</strong> SignalBoost may earn a commission if you sign up through these links, at no extra cost to you.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {PARTNERS.hosting.map(p => (
                <div key={p.name} onClick={() => setAnswers(a => ({ ...a, hostingProvider: p.name }))}
                  style={{ padding: '16px 20px', borderRadius: 14, cursor: 'pointer', background: answers.hostingProvider === p.name ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${answers.hostingProvider === p.name ? BLUE : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                      {p.recommended && <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 999, padding: '1px 8px' }}>Recommended</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{p.desc}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>{p.price}</div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: BLUE, textDecoration: 'none' }}>Visit site →</a>
                  </div>
                  {answers.hostingProvider === p.name && <span style={{ color: BLUE, fontSize: 20 }}>✓</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setStep(3)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(5)} style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>Continue →</button>
              <button onClick={() => setStep(5)} style={{ background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>Skip →</button>
            </div>
          </div>
        )}

        {/* STEP 5 — API Keys */}
        {step === 5 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Optional</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Connect your accounts</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 16 }}>These let SignalBoost deploy your site automatically. Completely optional — you can add them later in settings.</p>
            <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 24, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              🔒 <strong style={{ color: BLUE }}>Your keys are encrypted</strong> and stored securely. SignalBoost uses them only to deploy your site.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  Vercel API Token
                  <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: 'none', marginLeft: 8, fontSize: 11 }}>Get your token →</a>
                </label>
                <input type="password" placeholder="Paste your Vercel token here (optional)" value={answers.vercelToken} onChange={e => setAnswers(a => ({ ...a, vercelToken: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  GitHub Personal Access Token
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={{ color: BLUE, textDecoration: 'none', marginLeft: 8, fontSize: 11 }}>Get your token →</a>
                </label>
                <input type="password" placeholder="Paste your GitHub token here (optional)" value={answers.githubToken} onChange={e => setAnswers(a => ({ ...a, githubToken: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setStep(4)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(6)} style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>Continue →</button>
              <button onClick={() => setStep(6)} style={{ background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>Skip →</button>
            </div>
          </div>
        )}

        {/* STEP 6 — Business */}
        {step === 6 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Optional</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Tell me about your business</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 28 }}>The more you share, the better I can build your site. All optional.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Business name</label>
                <input placeholder="e.g. Maria's Bakery" value={answers.businessName} onChange={e => setAnswers(a => ({ ...a, businessName: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Business type</label>
                <select value={answers.businessType} onChange={e => setAnswers(a => ({ ...a, businessType: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none' }}>
                  <option value="">Select type...</option>
                  <option value="restaurant">Restaurant / Food</option>
                  <option value="retail">Retail / Shop</option>
                  <option value="services">Services / Consulting</option>
                  <option value="health">Health / Wellness</option>
                  <option value="education">Education / Coaching</option>
                  <option value="creative">Creative / Arts</option>
                  <option value="tech">Technology</option>
                  <option value="podcast">Podcast / Media</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Languages needed</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['English', 'Português', 'Español', 'Polski', 'Русский'].map(lang => (
                    <button key={lang} onClick={() => setAnswers(a => ({ ...a, languages: a.languages.includes(lang) ? a.languages.filter(l => l !== lang) : [...a.languages, lang] }))}
                      style={{ padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: answers.languages.includes(lang) ? BLUE : 'rgba(255,255,255,0.06)', color: answers.languages.includes(lang) ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s' }}>
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setStep(5)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(7)} style={{ background: GOLD, color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>Almost done →</button>
              <button onClick={() => setStep(7)} style={{ background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>Skip →</button>
            </div>
          </div>
        )}

        {/* STEP 7 — Ready */}
        {step === 7 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>🎉</div>
            <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
              You are all set,<br />
              <span style={{ color: GOLD }}>{firstName}!</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.7, maxWidth: 440, margin: '0 auto 32px' }}>
              {answers.businessName ? `Ready to build ${answers.businessName}'s online presence.` : 'Your AI assistant is ready to help you build.'} You can complete any skipped steps later from your dashboard settings.
            </p>
            <button onClick={finish}
              style={{ background: GOLD, color: '#000', fontWeight: 800, fontSize: 16, padding: '14px 48px', borderRadius: 999, border: 'none', cursor: 'pointer', display: 'block', margin: '0 auto 16px' }}>
              Go to my dashboard →
            </button>
            <button onClick={() => setStep(6)}
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              ← Edit my answers
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
