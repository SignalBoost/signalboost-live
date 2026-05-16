'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase/client'

const STEPS = [
  { id: 'welcome',   title: 'Welcome',          icon: '👋' },
  { id: 'experience',title: 'Your experience',  icon: '🎯' },
  { id: 'goal',      title: 'Your goal',        icon: '🚀' },
  { id: 'domain',    title: 'Domain name',      icon: '🌐' },
  { id: 'hosting',   title: 'Hosting',          icon: '⚡' },
  { id: 'keys',      title: 'Connect accounts', icon: '🔑' },
  { id: 'business',  title: 'Your business',    icon: '🏪' },
  { id: 'ready',     title: 'Ready to build',   icon: '🎉' },
]

const PARTNERS = {
  domain: [
    { name: 'Namecheap', url: 'https://namecheap.com', price: 'From $8.99/yr', recommended: true,  commission: true, desc: 'Best value for domains. Easy DNS management.' },
    { name: 'GoDaddy',   url: 'https://godaddy.com',   price: 'From $9.99/yr', recommended: false, commission: true, desc: 'Largest domain registrar worldwide.' },
    { name: 'Cloudflare', url: 'https://cloudflare.com', price: 'At cost pricing', recommended: false, commission: false, desc: 'No markup on domains. Free SSL and CDN included.' },
  ],
  hosting: [
    { name: 'Vercel',   url: 'https://vercel.com',   price: 'Free to start', recommended: true,  commission: true, desc: 'Best performance. Free tier available. Easy setup.' },
    { name: 'Netlify',  url: 'https://netlify.com',  price: 'Free to start', recommended: false, commission: true, desc: 'Great for static sites. Generous free tier.' },
    { name: 'Hostinger', url: 'https://hostinger.com', price: 'From $2.99/mo', recommended: false, commission: true, desc: 'Affordable. Good for beginners.' },
  ],
}

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [answers, setAnswers] = useState({
    experience: '',
    goal: '',
    businessName: '',
    businessType: '',
    businessDesc: '',
    languages: [] as string[],
    domainProvider: '',
    domainName: '',
    hostingProvider: '',
    vercelToken: '',
    githubToken: '',
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) { router.push('/'); return }
      const meta = data.user.user_metadata
      const fullName = meta?.full_name || meta?.name || ''
      setFirstName(fullName.split(' ')[0] || 'there')

      // Check if already onboarded
      supabase.from('profiles').select('onboarded').eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          if (profile?.onboarded) router.push('/dashboard')
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

  const progress = ((step) / (STEPS.length - 1)) * 100

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

      {/* Step indicator */}
      <div style={{ position: 'fixed', top: 20, right: 32, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
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
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, lineHeight: 1.7, marginBottom: 40, maxWidth: 480, margin: '0 auto 40px' }}>
              We are going to ask you a few quick questions to set up your perfect experience. This takes about 2 minutes.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginBottom: 40 }}>
              We hide nothing — everything about how SignalBoost works, who our partners are, and how we make money is in our <a href="/docs" style={{ color: BLUE, textDecoration: 'none' }}>Docs</a>.
            </p>
            <button onClick={() => setStep(1)}
              style={{ background: GOLD, color: '#000', fontWeight: 800, fontSize: 16, padding: '14px 48px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              Let's get started →
            </button>
          </div>
        )}

        {/* STEP 1 — Experience */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Your experience level</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 32px', letterSpacing: '-0.02em' }}>
              How would you describe yourself?
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
              {[
                { value: 'beginner', icon: '🙋', title: 'Complete beginner', desc: 'I have never built a website before. Guide me through everything.' },
                { value: 'some', icon: '📚', title: 'Some experience', desc: 'I have tried website builders before but need help with technical parts.' },
                { value: 'technical', icon: '👨‍💻', title: 'Technical user', desc: 'I am comfortable with code and just need the platform tools.' },
              ].map(opt => (
                <div key={opt.value} onClick={() => setAnswers(a => ({ ...a, experience: opt.value }))}
                  style={{
                    padding: '20px 24px', borderRadius: 16, cursor: 'pointer',
                    background: answers.experience === opt.value ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${answers.experience === opt.value ? BLUE : 'rgba(255,255,255,0.08)'}`,
                    display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{opt.icon}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{opt.title}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{opt.desc}</div>
                  </div>
                  {answers.experience === opt.value && <span style={{ marginLeft: 'auto', color: BLUE, fontSize: 20 }}>✓</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(0)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => answers.experience && setStep(2)} disabled={!answers.experience}
                style={{ background: answers.experience ? BLUE : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: answers.experience ? 'pointer' : 'default', opacity: answers.experience ? 1 : 0.5 }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — Goal */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Your goal</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 32px', letterSpacing: '-0.02em' }}>
              What do you want to build?
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 40 }}>
              {[
                { value: 'website',  icon: '🌐', title: 'A website',        desc: 'For my business, portfolio or personal brand' },
                { value: 'podcast',  icon: '🎙️', title: 'A podcast',        desc: 'Reach listeners in multiple languages' },
                { value: 'reviews',  icon: '⭐', title: 'Collect reviews',   desc: 'Build trust with customer testimonials' },
                { value: 'video',    icon: '🎬', title: 'Video content',     desc: 'Create multilingual videos and social clips' },
                { value: 'all',      icon: '🚀', title: 'All of the above',  desc: 'I want the full SignalBoost experience' },
                { value: 'unsure',   icon: '🤔', title: 'Not sure yet',      desc: 'Help me figure out what I need' },
              ].map(opt => (
                <div key={opt.value} onClick={() => setAnswers(a => ({ ...a, goal: opt.value }))}
                  style={{
                    padding: '18px 20px', borderRadius: 14, cursor: 'pointer',
                    background: answers.goal === opt.value ? 'rgba(255,195,0,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${answers.goal === opt.value ? GOLD : 'rgba(255,255,255,0.08)'}`,
                    transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: 24, display: 'block', marginBottom: 8 }}>{opt.icon}</span>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{opt.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{opt.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(1)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => answers.goal && setStep(3)} disabled={!answers.goal}
                style={{ background: answers.goal ? BLUE : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: answers.goal ? 'pointer' : 'default', opacity: answers.goal ? 1 : 0.5 }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Domain */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Domain name</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              What is your website address?
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 28 }}>
              This is your domain name — like <strong style={{ color: '#fff' }}>mybakery.com</strong>. You buy this from a domain provider. We recommend these partners:
            </p>

            <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              💡 <strong style={{ color: GOLD }}>Transparency:</strong> SignalBoost may earn a commission if you sign up through these links, at no extra cost to you. We only recommend providers we trust.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {PARTNERS.domain.map(p => (
                <div key={p.name}
                  onClick={() => setAnswers(a => ({ ...a, domainProvider: p.name }))}
                  style={{
                    padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
                    background: answers.domainProvider === p.name ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${answers.domainProvider === p.name ? BLUE : 'rgba(255,255,255,0.08)'}`,
                    display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s',
                  }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                      {p.recommended && <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 999, padding: '1px 8px' }}>Recommended</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{p.desc}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>{p.price}</div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: BLUE, textDecoration: 'none' }}>
                      Visit site →
                    </a>
                  </div>
                  {answers.domainProvider === p.name && <span style={{ color: BLUE, fontSize: 20, flexShrink: 0 }}>✓</span>}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 32 }}>
              <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 8 }}>
                Already have a domain? Enter it here (optional):
              </label>
              <input
                placeholder="e.g. mybakery.com"
                value={answers.domainName}
                onChange={e => setAnswers(a => ({ ...a, domainName: e.target.value }))}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(2)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(4)}
                style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Continue →
              </button>
              <button onClick={() => setStep(4)}
                style={{ background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Hosting */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Hosting</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Where should your site live?
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 28 }}>
              Hosting is where your website files are stored and served to visitors. We recommend starting free.
            </p>

            <div style={{ background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              💡 <strong style={{ color: GOLD }}>Transparency:</strong> SignalBoost may earn a commission if you sign up through these links, at no extra cost to you.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {PARTNERS.hosting.map(p => (
                <div key={p.name}
                  onClick={() => setAnswers(a => ({ ...a, hostingProvider: p.name }))}
                  style={{
                    padding: '16px 20px', borderRadius: 14, cursor: 'pointer',
                    background: answers.hostingProvider === p.name ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${answers.hostingProvider === p.name ? BLUE : 'rgba(255,255,255,0.08)'}`,
                    display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s',
                  }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                      {p.recommended && <span style={{ fontSize: 10, fontWeight: 700, color: GOLD, background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)', borderRadius: 999, padding: '1px 8px' }}>Recommended</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{p.desc}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>{p.price}</div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: BLUE, textDecoration: 'none' }}>
                      Visit site →
                    </a>
                  </div>
                  {answers.hostingProvider === p.name && <span style={{ color: BLUE, fontSize: 20, flexShrink: 0 }}>✓</span>}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(3)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(5)}
                style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Continue →
              </button>
              <button onClick={() => setStep(5)}
                style={{ background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* STEP 5 — API Keys */}
        {step === 5 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Connect your accounts</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Paste your API keys
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 12 }}>
              These keys let SignalBoost build and deploy your site automatically. We never share them with anyone.
            </p>

            <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 24, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              🔒 <strong style={{ color: BLUE }}>Your keys are encrypted</strong> and stored securely. SignalBoost uses them only to deploy your site. You can revoke them anytime from your provider dashboard.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  Vercel API Token
                  <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer"
                    style={{ color: BLUE, textDecoration: 'none', marginLeft: 8, fontSize: 11 }}>
                    Get your token →
                  </a>
                </label>
                <input
                  type="password"
                  placeholder="Paste your Vercel token here"
                  value={answers.vercelToken}
                  onChange={e => setAnswers(a => ({ ...a, vercelToken: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  GitHub Personal Access Token
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer"
                    style={{ color: BLUE, textDecoration: 'none', marginLeft: 8, fontSize: 11 }}>
                    Get your token →
                  </a>
                </label>
                <input
                  type="password"
                  placeholder="Paste your GitHub token here"
                  value={answers.githubToken}
                  onChange={e => setAnswers(a => ({ ...a, githubToken: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(4)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(6)}
                style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Continue →
              </button>
              <button onClick={() => setStep(6)}
                style={{ background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 13, padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* STEP 6 — Business info */}
        {step === 6 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Your business</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Tell me about your business
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 28 }}>
              The more you tell me, the better I can build your site automatically.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Business name *</label>
                <input placeholder="e.g. Maria's Bakery" value={answers.businessName}
                  onChange={e => setAnswers(a => ({ ...a, businessName: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>What type of business?</label>
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
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Describe your business in one sentence</label>
                <input placeholder="e.g. We sell handmade Portuguese pastries in Lisbon" value={answers.businessDesc}
                  onChange={e => setAnswers(a => ({ ...a, businessDesc: e.target.value }))}
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Which languages do you need?</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['English', 'Português', 'Español', 'Polski', 'Русский'].map(lang => (
                    <button key={lang}
                      onClick={() => setAnswers(a => ({
                        ...a,
                        languages: a.languages.includes(lang) ? a.languages.filter(l => l !== lang) : [...a.languages, lang]
                      }))}
                      style={{
                        padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', border: 'none',
                        background: answers.languages.includes(lang) ? BLUE : 'rgba(255,255,255,0.06)',
                        color: answers.languages.includes(lang) ? '#fff' : 'rgba(255,255,255,0.5)',
                        transition: 'all 0.15s',
                      }}>
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep(5)} style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 28px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>← Back</button>
              <button onClick={() => answers.businessName && setStep(7)} disabled={!answers.businessName}
                style={{ background: answers.businessName ? GOLD : 'rgba(255,255,255,0.05)', color: answers.businessName ? '#000' : '#fff', fontWeight: 800, fontSize: 14, padding: '12px 36px', borderRadius: 999, border: 'none', cursor: answers.businessName ? 'pointer' : 'default', opacity: answers.businessName ? 1 : 0.5 }}>
                Almost done →
              </button>
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
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.7, marginBottom: 16, maxWidth: 440, margin: '0 auto 16px' }}>
              {answers.businessName ? `We are ready to build ${answers.businessName}'s online presence.` : 'We are ready to start building.'} Your AI assistant already knows everything about your setup.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '20px 24px', marginBottom: 32, textAlign: 'left', maxWidth: 400, margin: '0 auto 32px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Your setup summary</div>
              {[
                { label: 'Experience', value: answers.experience || 'Not set' },
                { label: 'Goal', value: answers.goal || 'Not set' },
                { label: 'Business', value: answers.businessName || 'Not set' },
                { label: 'Languages', value: answers.languages.length > 0 ? answers.languages.join(', ') : 'Not set' },
                { label: 'Domain provider', value: answers.domainProvider || 'Not set' },
                { label: 'Hosting', value: answers.hostingProvider || 'Not set' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{item.label}</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>

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
