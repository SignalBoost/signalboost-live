'use client'

import { useState } from 'react'

export default function Concierge() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI Concierge"
        style={{
          position: 'fixed',
          right: 30,
          bottom: 30,
          zIndex: 999999,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 18px',
          borderRadius: 999,
          background: 'linear-gradient(135deg,#ffc300,#ff9500)',
          color: '#111',
          fontSize: 16,
          fontWeight: 800,
          boxShadow: '0 10px 35px rgba(0,0,0,.35)',
        }}
      >
        <span style={{ fontSize: 26 }}>✨</span>
        <span>AI Concierge</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="SignalBoost AI Concierge"
          style={{
            position: 'fixed',
            right: 30,
            bottom: 105,
            zIndex: 999999,
            width: 380,
            maxWidth: 'calc(100vw - 40px)',
            borderRadius: 24,
            background: 'rgba(15,15,20,.96)',
            color: 'white',
            padding: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,.45)',
            border: '1px solid rgba(255,255,255,.15)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>SignalBoost</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                AI Concierge
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close AI Concierge"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 24,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,.08)',
              padding: 16,
              borderRadius: 16,
              marginBottom: 16,
              lineHeight: 1.45,
            }}
          >
            Hi, I&apos;m your SignalBoost concierge. I can help with videos,
            credits, pricing, reviews, outreach, and support.
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['🎥 Videos', '⚡ Credits', '📈 Growth', '💬 Support'].map(
              (label) => (
                <button
                  key={label}
                  type="button"
                  style={{
                    border: '1px solid rgba(255,255,255,.18)',
                    background: 'rgba(255,255,255,.08)',
                    color: 'white',
                    borderRadius: 999,
                    padding: '9px 12px',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
