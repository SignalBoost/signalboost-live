'use client'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useState } from 'react'

const SECTIONS = [
  {
    category: 'Getting started',
    icon: '🚀',
    articles: [
      { title: 'Quick start guide', slug: 'quick-start', time: '3 min read' },
      { title: 'Creating your first project', slug: 'first-project', time: '5 min read' },
      { title: 'Connecting your domain', slug: 'domain', time: '4 min read' },
      { title: 'Inviting team members', slug: 'team', time: '2 min read' },
    ],
  },
  {
    category: 'Site builder',
    icon: '🌐',
    articles: [
      { title: 'Building your first page', slug: 'site-builder', time: '6 min read' },
      { title: 'Adding multilingual content', slug: 'multilingual', time: '5 min read' },
      { title: 'Customizing your design', slug: 'design', time: '4 min read' },
      { title: 'Publishing your site', slug: 'publish', time: '2 min read' },
    ],
  },
  {
    category: 'Reviews',
    icon: '⭐',
    articles: [
      { title: 'Setting up review collection', slug: 'reviews-setup', time: '3 min read' },
      { title: 'Embedding review widgets', slug: 'review-widgets', time: '4 min read' },
      { title: 'Moderating reviews', slug: 'review-moderation', time: '3 min read' },
    ],
  },
  {
    category: 'Native audio',
    icon: '🎙️',
    articles: [
      { title: 'Generating your first voiceover', slug: 'audio-start', time: '4 min read' },
      { title: 'Supported languages', slug: 'audio-languages', time: '2 min read' },
      { title: 'Audio credits explained', slug: 'audio-credits', time: '3 min read' },
      { title: 'Downloading audio files', slug: 'audio-download', time: '2 min read' },
    ],
  },
  {
    category: 'Video editor',
    icon: '🎬',
    articles: [
      { title: 'Creating your first video', slug: 'video-start', time: '5 min read' },
      { title: 'Adding captions and subtitles', slug: 'captions', time: '4 min read' },
      { title: 'Exporting for social media', slug: 'video-export', time: '3 min read' },
      { title: 'Caption formats (SRT, VTT)', slug: 'caption-formats', time: '2 min read' },
    ],
  },
  {
    category: 'Podcasters',
    icon: '🎧',
    articles: [
      { title: 'Getting started as a podcaster', slug: 'podcast-start', time: '4 min read' },
      { title: 'Uploading your episode', slug: 'podcast-upload', time: '3 min read' },
      { title: 'Generating multilingual audio', slug: 'podcast-audio', time: '4 min read' },
      { title: 'Creating social clips', slug: 'podcast-clips', time: '3 min read' },
    ],
  },
  {
    category: 'Billing & plans',
    icon: '💳',
    articles: [
      { title: 'Understanding your plan', slug: 'plans', time: '3 min read' },
      { title: 'Managing your subscription', slug: 'subscription', time: '3 min read' },
      { title: 'Partner benefits', slug: 'partner-benefits', time: '2 min read' },
      { title: 'Cancelling your plan', slug: 'cancel', time: '2 min read' },
    ],
  },
  {
    category: 'Account & team',
    icon: '👥',
    articles: [
      { title: 'Managing team members', slug: 'team-manage', time: '3 min read' },
      { title: 'Seat limits by plan', slug: 'seats', time: '2 min read' },
      { title: 'Account settings', slug: 'account', time: '2 min read' },
      { title: 'Deleting your account', slug: 'delete-account', time: '2 min read' },
    ],
  },
]

export default function DocsPage() {
  const [search, setSearch] = useState('')

  const filtered = SECTIONS.map(s => ({
    ...s,
    articles: s.articles.filter(a =>
      a.title.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(s => s.articles.length > 0)

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'system-ui' }}>
      <Navbar />

      {/* Header */}
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)',
          borderRadius: 999, padding: '4px 16px', marginBottom: 24,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: '#ffc300',
        }}>
          Documentation
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 16px' }}>
          How can we help?
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, margin: '0 0 32px' }}>
          Everything you need to get the most out of SignalBoost.
        </p>

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: 480, margin: '0 auto' }}>
          <span style={{
            position: 'absolute', left: 16, top: '50%',
            transform: 'translateY(-50%)', fontSize: 16,
            pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search docs..."
            style={{
              width: '100%', padding: '14px 16px 14px 44px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, fontSize: 15, color: '#fff',
              outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.4)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          />
        </div>
      </section>

      {/* Quick links */}
      {!search && (
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { icon: '🚀', label: 'Quick start', href: '#getting-started' },
              { icon: '🎙️', label: 'Native audio', href: '#native-audio' },
              { icon: '🎬', label: 'Video editor', href: '#video-editor' },
              { icon: '💳', label: 'Billing', href: '#billing--plans' },
            ].map(q => (
              <a key={q.label} href={q.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: '16px 20px',
                  textDecoration: 'none', color: '#fff',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,195,0,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
                <span style={{ fontSize: 22 }}>{q.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{q.label}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Sections */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 120px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.25)', fontSize: 15 }}>
            No results for "{search}" — try a different search term.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
            {filtered.map(section => (
              <div key={section.category}
                id={section.category.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '')}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 16, padding: '24px',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>
                    {section.icon}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                    {section.category}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {section.articles.map(article => (
                    <div key={article.slug}
                      style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: 8,
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: 'rgba(255,195,0,0.5)', fontSize: 12 }}>→</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                          {article.title}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap', marginLeft: 12 }}>
                        {article.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Contact */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20, padding: '40px 32px',
        }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>💬</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>
            Can't find what you need?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
            Our team is happy to help. Send us a message and we'll get back to you within 24 hours.
          </p>
          <button
            onClick={() => window.location.href = 'mailto:cadomos@gmail.com?subject=SignalBoost Support'}
            style={{ background: '#ffc300', color: '#000', fontWeight: 800, fontSize: 14, padding: '12px 32px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
            Contact support
          </button>
        </div>
      </section>

    </main>
  )
}
