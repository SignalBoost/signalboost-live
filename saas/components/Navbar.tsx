'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const GOLD = '#ffc300'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'ru', label: 'Русский' },
]

export default function Navbar() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pathname = usePathname()
  const { lang, setLang, dict } = useI18n()

  const [showAuth, setShowAuth] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null)
    })

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(session?.user ?? null)
        }
      )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    const W = 40
    const H = 40

    canvas.width = W
    canvas.height = H

    const cx = W / 2
    const cy = H - 8

    let rings: {
      r:number
      alpha:number
    }[] = []

    let last = 0
    let raf:number

    function draw(ts:number) {
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

        r.r+=0.8
        r.alpha-=0.012

        ctx.globalAlpha=Math.max(
          0,
          r.alpha
        )

        ctx.strokeStyle=GOLD
        ctx.lineWidth=1

        ctx.beginPath()

        ctx.arc(
          cx,
          cy,
          r.r,
          Math.PI,
          0
        )

        ctx.stroke()
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

      raf=requestAnimationFrame(draw)
    }

    raf=requestAnimationFrame(draw)

    return ()=>{
      cancelAnimationFrame(raf)
    }

  },[])

  async function handleLogout(){

    sessionStorage.removeItem(
      'greetingDismissed'
    )

    await supabase.auth.signOut()

    window.location.href='/'
  }

  const navLinks=[
{
label:t(dict,'home','Home'),
href:'/'
},

{
label:t(
dict,
'podcasters',
'Podcasters'
),
href:'/podcasters'
},

...(user
?[]
:[
{
label:t(
dict,
'dashboard',
'Dashboard'
),
href:'/dashboard'
}
]),

{
label:t(
dict,
'pricing',
'Pricing'
),
href:'/pricing'
},

{
label:t(
dict,
'docs',
'Docs'
),
href:'/docs'
}
]

const toolLinks=[

{
icon:'📣',
label:'Promote business',
href:'/dashboard/promote'
},

{
icon:'🌐',
label:t(
dict,
'buildWebsite',
'Build a website'
),
href:'/dashboard/builder'
},

{
icon:'⭐',
label:t(
dict,
'collectReviews',
'Collect reviews'
),
href:'/dashboard/reviews'
},

{
icon:'🎙️',
label:t(
dict,
'generateAudio',
'Generate audio'
),
href:'/dashboard/audio'
},

{
icon:'🎬',
label:t(
dict,
'createVideos',
'Create videos'
),
href:'/dashboard/video'
},

{
icon:'🧪',
label:'Lab',
href:'/dashboard/lab'
}

]

return(
<>
{/* Keep remainder of your existing JSX unchanged */}

{/* replace only toolLinks above */}
</>
)
}
