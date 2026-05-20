'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'

const GOLD = '#ffc300'

const TOOL_LINKS = [
  { icon:'🌐',label:'Build a website',href:'/dashboard/builder'},
  { icon:'⭐',label:'Collect reviews',href:'/dashboard/reviews'},
  { icon:'🎙️',label:'Generate audio',href:'/dashboard/audio'},
  { icon:'🎬',label:'Create videos',href:'/dashboard/video'},
]

const LANGUAGES = [
  {code:'en',label:'English'},
  {code:'pt',label:'Português'},
  {code:'es',label:'Español'},
  {code:'pl',label:'Polski'},
  {code:'ru',label:'Русский'},
]

export default function Navbar() {
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const pathname=usePathname()

  const [showAuth,setShowAuth]=useState(false)
  const [user,setUser]=useState<any>(null)
  const [language,setLanguage]=useState('en')

  useEffect(()=>{
    if(typeof window==='undefined') return

    const saved=
      localStorage.getItem(
        'signalboost_language'
      )

    if(saved){
      setLanguage(saved)
    }
  },[])

  useEffect(()=>{
    supabase.auth.getUser().then(
      ({data})=>{
        setUser(data?.user ?? null)
      }
    )

    const {data:listener}=
      supabase.auth.onAuthStateChange(
        (_e,session)=>{
          setUser(session?.user ?? null)
        }
      )

    return ()=>listener.subscription.unsubscribe()
  },[])

  useEffect(()=>{
    const canvas=canvasRef.current
    if(!canvas) return

    const ctx=canvas.getContext('2d')!

    const W=40
    const H=40

    canvas.width=W
    canvas.height=H

    const cx=W/2
    const cy=H-8

    let rings:{
      r:number
      alpha:number
    }[]=[]

    let last=0
    let raf:number

    function draw(ts:number){

      ctx.clearRect(0,0,W,H)

      if(!last || ts-last>2000){
        rings.push({
          r:0,
          alpha:1
        })

        last=ts
      }

      rings=rings.filter(
        r=>r.alpha>.01
      )

      for(const r of rings){

        r.r+=.8
        r.alpha-=.012

        const arcs=[1,.65]
        const widths=[1.2,.8]
        const alphas=[.9,.5]

        for(let i=0;i<2;i++){

          if(r.r*arcs[i]<3)
            continue

          ctx.globalAlpha=
            Math.max(
              0,
              r.alpha*alphas[i]
            )

          ctx.strokeStyle=GOLD
          ctx.lineWidth=widths[i]

          ctx.beginPath()

          ctx.arc(
            cx,
            cy,
            r.r*arcs[i],
            Math.PI,
            0
          )

          ctx.stroke()
        }
      }

      ctx.globalAlpha=1

      ctx.fillStyle=GOLD

      ctx.beginPath()
      ctx.arc(
        cx,
        cy,
        3,
        0,
        Math.PI*2
      )

      ctx.fill()

      ctx.fillStyle='#0a0a0f'

      ctx.beginPath()

      ctx.arc(
        cx,
        cy,
        1.5,
        0,
        Math.PI*2
      )

      ctx.fill()

      raf=requestAnimationFrame(draw)
    }

    raf=requestAnimationFrame(draw)

    return()=>{
      cancelAnimationFrame(raf)
    }

  },[])

  async function handleLogout(){

    if(
      typeof window!=='undefined'
    ){
      sessionStorage.removeItem(
        'greetingDismissed'
      )

      localStorage.removeItem(
        'signalboost_language_prompted'
      )
    }

    await supabase.auth.signOut()

    window.location.href='/'
  }

  function openLogin(){
    setShowAuth(true)
  }

  function openSignup(){
    setShowAuth(true)
  }

  function changeLanguage(
    next:string
  ){
    setLanguage(next)

    localStorage.setItem(
      'signalboost_language',
      next
    )
  }

  const navLinks=[
    {
      label:'Home',
      href:'/'
    },
    {
      label:'Podcasters',
      href:'/podcasters'
    },

    ...(user
      ?[]
      :[
        {
          label:'Dashboard',
          href:'/dashboard'
        }
      ]),

    {
      label:'Pricing',
      href:'/pricing'
    },
    {
      label:'Docs',
      href:'/docs'
    }
  ]

  return(
    <>
      <nav
      style={{
        display:'flex',
        alignItems:'center',
        justifyContent:'space-between',
        padding:'16px 32px',
        background:
        'rgba(10,10,15,.88)',
        backdropFilter:'blur(12px)',
        borderBottom:
        '1px solid var(--border-soft)',
        position:'sticky',
        top:0,
        zIndex:100
      }}
      >

      <Link
      href="/"
      style={{
        display:'flex',
        alignItems:'center',
        gap:10,
        textDecoration:'none'
      }}
      >

      <div
      style={{
        width:40,
        height:40,
        position:'relative'
      }}
      >

      <canvas
      ref={canvasRef}
      style={{
        width:'100%',
        height:'100%'
      }}
      />

      </div>

      <span
      style={{
        color:'#fff',
        fontWeight:800
      }}
      >
      signal
      <span
      style={{
        color:GOLD
      }}>
      boost
      </span>
      </span>

      </Link>
              <div
      style={{
        display:'flex',
        gap:24
      }}
      >

      {navLinks.map(item=>{

        const isActive=
        pathname===item.href ||
        (
          item.href!=='/' &&
          pathname?.startsWith(
            item.href
          )
        )

        return(

        <Link
        key={item.label}
        href={item.href}
        style={{
          textDecoration:'none',
          color:
          isActive
          ?'#fff'
          :'var(--text-muted)'
        }}
        >
        {item.label}
        </Link>

        )
      })}

      </div>

      <div
      style={{
        display:'flex',
        alignItems:'center',
        gap:10
      }}
      >

      <select
      value={language}
      onChange={e=>
      changeLanguage(
        e.target.value
      )}
      >
      {LANGUAGES.map(
        lang=>(
        <option
        key={lang.code}
        value={lang.code}
        >
        {lang.label}
        </option>
      ))}
      </select>

      {user ? (

      <>
      <Link href="/dashboard">

      <button>
      Dashboard
      </button>

      </Link>

      <button
      onClick={
        handleLogout
      }
      >
      Log out
      </button>

      </>

      ):(

      <>
      <button
      onClick={
        openLogin
      }
      >
      Log in
      </button>

      <button
      onClick={
        openSignup
      }
      style={{
        background:GOLD,
        color:'#000'
      }}
      >
      Get started
      </button>

      </>
      )}

      </div>

      </nav>

      {user && (

      <div
      style={{
        display:'flex',
        justifyContent:'center',
        gap:8,
        padding:'8px 24px',
        flexWrap:'wrap'
      }}
      >

      {TOOL_LINKS.map(
        tool=>{

        const isActive=
        pathname===
        tool.href

        return(
        <Link
        key={tool.href}
        href={tool.href}
        style={{
          textDecoration:'none',
          color:
          isActive
          ?'#fff'
          :'var(--text-muted)'
        }}
        >
        {tool.icon}
        {' '}
        {tool.label}
        </Link>
        )

      })}

      </div>

      )}

      {showAuth && (
        <AuthModal
          onClose={()=>
            setShowAuth(false)
          }
        />
      )}

    </>
  )
}
