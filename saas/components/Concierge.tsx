'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'

const COPY = {
  en: {
    label:'AI Concierge',
    title:'AI Concierge',
    default:"Hi, I'm your SignalBoost concierge.",
    thinking:'Thinking...',
    videosBtn:'🎥 Videos',
    creditsBtn:'⚡ Credits',
    growthBtn:'📈 Growth',
    supportBtn:'💬 Support',
  },
}

export default function Concierge() {
  const [open,setOpen] = useState(false)
  const [message,setMessage] = useState('')
  const [loading,setLoading] = useState(false)

  usePathname()
  useI18n()

  const copy = COPY.en

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position:'fixed',
          right:24,
          bottom:24,
          zIndex:999999,
          border:'none',
          cursor:'pointer',
          display:'flex',
          alignItems:'center',
          gap:10,
          padding:'14px 18px',
          borderRadius:999,
          background:
            'linear-gradient(135deg,#ffc300,#ff9500)',
          color:'#111',
          fontWeight:800,
          boxShadow:
            '0 20px 50px rgba(255,149,0,.35)',
          transition:'all .25s ease',
        }}
      >
        <span
          style={{
            fontSize:26,
          }}
        >
          ✨
        </span>

        {copy.label}
      </button>

      {open && (
        <div
          style={{
            position:'fixed',
            right:24,
            bottom:100,
            zIndex:999999,
            width:400,
            maxWidth:'calc(100vw - 30px)',
            borderRadius:28,
            overflow:'hidden',
            backdropFilter:'blur(25px)',
            background:
              'rgba(20,20,25,.92)',
            border:
              '1px solid rgba(255,255,255,.08)',
            color:'white',
            boxShadow:
              '0 25px 80px rgba(0,0,0,.5)',
          }}
        >
          <div
            style={{
              padding:24,
              background:
                'linear-gradient(135deg,rgba(255,195,0,.15),rgba(255,149,0,.05))',
              borderBottom:
                '1px solid rgba(255,255,255,.06)',
            }}
          >
            <div
              style={{
                display:'flex',
                justifyContent:'space-between',
                alignItems:'center',
              }}
            >
              <div>
                <div
                  style={{
                    opacity:.6,
                    fontSize:12,
                  }}
                >
                  SignalBoost
                </div>

                <div
                  style={{
                    fontSize:22,
                    fontWeight:800,
                  }}
                >
                  {copy.title}
                </div>
              </div>

              <button
                onClick={() => setOpen(false)}
                style={{
                  background:'transparent',
                  border:'none',
                  color:'white',
                  fontSize:24,
                  cursor:'pointer',
                  opacity:.7,
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div
            style={{
              padding:20,
            }}
          >
            <div
              style={{
                background:
                  'rgba(255,255,255,.06)',
                padding:18,
                borderRadius:18,
                lineHeight:1.6,
                marginBottom:18,
              }}
            >
              {loading
                ? copy.thinking
                : message || copy.default}
            </div>

            <div
              style={{
                display:'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                gap:10,
              }}
            >
              {[
                copy.videosBtn,
                copy.creditsBtn,
                copy.growthBtn,
                copy.supportBtn,
              ].map((label)=>(
                <button
                  key={label}
                  style={{
                    border:'none',
                    padding:'12px',
                    borderRadius:14,
                    background:
                      'rgba(255,255,255,.07)',
                    color:'white',
                    cursor:'pointer',
                    fontWeight:700,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
