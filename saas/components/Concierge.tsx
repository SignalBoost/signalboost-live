'use client'

import { useState } from 'react'

export default function Concierge() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 30,
          bottom: 30,
          zIndex: 999999,
          width: 72,
          height: 72,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background:
            'linear-gradient(135deg,#ffc300,#ff9500)',
          color: '#111',
          fontSize: 32,
          fontWeight: 900,
          boxShadow: '0 10px 35px rgba(0,0,0,.35)',
        }}
      >
        ✨
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            right: 30,
            bottom: 120,
            zIndex: 999999,
            width: 380,
            maxWidth: 'calc(100vw - 30px)',
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
              marginBottom: 18,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  opacity: .6,
                }}
              >
                SignalBoost
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                Concierge
              </div>
            </div>

            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 22,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              background:'rgba(255,255,255,.08)',
              padding:16,
              borderRadius:16,
              marginBottom:16
            }}
          >
            Hi, I'm your SignalBoost concierge.
          </div>

          <div
            style={{
              display:'flex',
              gap:8,
              flexWrap:'wrap'
            }}
          >
            <button>🎥 Videos</button>
            <button>⚡ Credits</button>
            <button>📈 Growth</button>
            <button>💬 Support</button>
          </div>
        </div>
      )}
    </>
  )
}
