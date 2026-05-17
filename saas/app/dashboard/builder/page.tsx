'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

const TEMPLATES = [
  { id: 'restaurant', icon: '🍽️', name: 'Restaurant', desc: 'Menu, hours, reservations, location' },
  { id: 'retail',     icon: '🛍️', name: 'Retail Shop', desc: 'Products, pricing, contact, about' },
  { id: 'services',   icon: '💼', name: 'Services',    desc: 'What you offer, pricing, booking' },
  { id: 'podcast',    icon: '🎙️', name: 'Podcast',     desc: 'Episodes, about, subscribe links' },
  { id: 'portfolio',  icon: '🎨', name: 'Portfolio',   desc: 'Work showcase, bio, contact' },
  { id: 'blank',      icon: '✨', name: 'Start blank',  desc: 'Build from scratch with AI help' },
]

const LANGS = [
  { code: 'en', flag: '🇺🇸', name: 'English' },
  { code: 'pt', flag: '🇧🇷', name: 'Português' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
]

export default function BuilderPage() {
  const [step, setStep] = useState<'template' | 'info' | 'languages' | 'building' | 'done'>('template')
  const [template, setTemplate] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessDesc, setBusinessDesc] = useState('')
  const [languages, setLanguages] = useState<string[]>(['en'])
  const [aiMessage, setAiMessage] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<{role: string, content: string}[]>([])
  const [loading, setLoading] = useState(false)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const meta = data.user.user_metadata
        const fullName = meta?.full_name || meta?.name || ''
        setUserName(fullName.split(' ')[0] || '')
      }
    })
  }, [])

  async function sendMessage(text?: string) {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')
    const newMessages = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          context: {
            userName,
            currentPage: 'Site Builder',
            userPlan: 'free',
            task: `Building a ${template} website called "${businessName}". Description: ${businessDesc}. Languages: ${languages.join(', ')}`,
          }
        })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Having trouble connecting. Please try again.' }])
    }
    setLoading(false)
  }

  async function startBuilding() {
    setStep('building')
    setMessages([{
      role: 'assistant',
      content: `Great${userName ? ' ' + userName : ''}! I am building your ${template} website for "${businessName}" in ${languages.length} language${languages.length > 1 ? 's' : ''}.\n\nHere is what I am creating:\n\n✓ Homepage with your business info\n✓ About section\n✓ Contact details\n✓ ${languages.length > 1 ? `Content in ${languages.length} languages` : 'English content'}\n\nWhile I work on this, tell me more about your business — the more details you give me, the better your site will be. What makes your business special?`
    }])
  }

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 20, marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>🌐 Site builder</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
            Tell me about your business and I will build your multilingual website automatically.
          </p>
        </div>
        {step !== 'template' && step !== 'done' && (
          <button onClick={() => setStep('template')}
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
            ← Start over
          </button>
        )}
      </div>

      {/* STEP: Template */}
      {step === 'template' && (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>What kind of site do you need?</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Choose a starting point — you can customize everything after.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {TEMPLATES.map(t => (
              <div key={t.id}
                onClick={() => { setTemplate(t.id); setStep('info') }}
                style={{
                  padding: '24px 20px', borderRadius: 16, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  transition: 'all 0.15s', textAlign: 'center',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(59,130,246,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'
                  e.currentTarget.style.transform = 'translateY(-3px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{t.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP: Business info */}
      {step === 'info' && (
        <div style={{ maxWidth: 560, animation: 'fadeIn 0.3s ease-out' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Tell me about your business</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28 }}>The AI will use this to generate your entire site automatically.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Business name *</label>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Maria's Bakery"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>Describe your business</label>
              <textarea value={businessDesc} onChange={e => setBusinessDesc(e.target.value)}
                placeholder="e.g. We sell handmade Portuguese pastries in Lisbon. We are open Monday to Saturday 7am-6pm. We also do custom orders for events."
                rows={4}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'system-ui' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('template')}
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 24px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={() => businessName && setStep('languages')} disabled={!businessName}
              style={{ background: businessName ? BLUE : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 32px', borderRadius: 999, border: 'none', cursor: businessName ? 'pointer' : 'default', opacity: businessName ? 1 : 0.5 }}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* STEP: Languages */}
      {step === 'languages' && (
        <div style={{ maxWidth: 560, animation: 'fadeIn 0.3s ease-out' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Which languages do you need?</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Your site will be available in all selected languages with native content.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {LANGS.map(lang => (
              <div key={lang.code}
                onClick={() => setLanguages(prev =>
                  prev.includes(lang.code) && prev.length > 1
                    ? prev.filter(l => l !== lang.code)
                    : prev.includes(lang.code) ? prev : [...prev, lang.code]
                )}
                style={{
                  padding: '14px 20px', borderRadius: 12, cursor: 'pointer',
                  background: languages.includes(lang.code) ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${languages.includes(lang.code) ? BLUE : 'rgba(255,255,255,0.07)'}`,
                  display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 24 }}>{lang.flag}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{lang.name}</span>
                {languages.includes(lang.code) && <span style={{ marginLeft: 'auto', color: BLUE, fontWeight: 700 }}>✓</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>
            {languages.length === 1 ? 'Free plan: 1 language included' : `${languages.length} languages selected — requires Starter plan or above`}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('info')}
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 14, padding: '12px 24px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
              ← Back
            </button>
            <button onClick={startBuilding}
              style={{ background: GOLD, color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 32px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
              Build my site →
            </button>
          </div>
        </div>
      )}

      {/* STEP: Building with AI chat */}
      {step === 'building' && (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

            {/* Site preview placeholder */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, minHeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{businessName}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
                Your site is being built. Tell the AI more about your business in the chat to customize it.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {languages.map(l => {
                  const lang = LANGS.find(x => x.code === l)
                  return lang ? (
                    <div key={l} style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', fontSize: 12, fontWeight: 600 }}>
                      {lang.flag} {lang.name}
                    </div>
                  ) : null
                })}
              </div>
              <div style={{ marginTop: 32, padding: '12px 24px', borderRadius: 12, background: 'rgba(255,195,0,0.06)', border: '1px solid rgba(255,195,0,0.15)', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                Full site preview coming soon — connect your domain and hosting to deploy
              </div>
            </div>

            {/* AI Chat */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: 560 }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>AI Builder Assistant</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '85%', padding: '10px 14px', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.role === 'user' ? BLUE : 'rgba(255,255,255,0.06)',
                      border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 4 }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', animation: `spin 1s ease-in-out ${i*0.15}s infinite` }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Tell me more about your business..."
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, outline: 'none' }} />
                <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
                  style={{ width: 36, height: 36, borderRadius: 8, background: input.trim() && !loading ? BLUE : 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ↑
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
