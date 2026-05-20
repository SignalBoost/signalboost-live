'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect,useRef,useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import AuthModal from './AuthModal'
import { useI18n } from '@/components/i18n/I18nProvider'

const GOLD='#ffc300'

const TOOL_LINKS=[
{icon:'🌐',label:'Build a website',href:'/dashboard/builder'},
{icon:'⭐',label:'Collect reviews',href:'/dashboard/reviews'},
{icon:'🎙️',label:'Generate audio',href:'/dashboard/audio'},
{icon:'🎬',label:'Create videos',href:'/dashboard/video'},
]

const LANGUAGES=[
{code:'en',label:'English'},
{code:'pt',label:'Português'},
{code:'es',label:'Español'},
{code:'pl',label:'Polski'},
{code:'ru',label:'Русский'},
]

export default function Navbar(){

const canvasRef=
useRef<HTMLCanvasElement>(null)

const pathname=
usePathname()

const {lang,setLang}=useI18n()

const [showAuth,setShowAuth]=
useState(false)

const [user,setUser]=
useState<any>(null)

useEffect(()=>{

supabase.auth.getUser().then(
({data})=>{
setUser(
data?.user ?? null
)
}
)

const {data:listener}=
supabase.auth.onAuthStateChange(
(_e,session)=>{
setUser(
session?.user ?? null
)
}
)

return()=>{
listener.subscription.unsubscribe()
}

},[])

useEffect(()=>{

const canvas=
canvasRef.current

if(!canvas) return

const ctx=
canvas.getContext('2d')!

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

if(
!last ||
ts-last>2000
){

rings.push({
r:0,
alpha:1
})

last=ts
}

rings=
rings.filter(
r=>r.alpha>.01
)

for(const r of rings){

r.r+=.8
r.alpha-=.012

ctx.globalAlpha=
Math.max(
0,
r.alpha
)

ctx.strokeStyle=
GOLD

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

raf=
requestAnimationFrame(draw)

}

raf=
requestAnimationFrame(draw)

return()=>{
cancelAnimationFrame(
raf
)
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
{label:'Home',href:'/'},
{label:'Podcasters',href:'/podcasters'},
...(user?[]:[{
label:'Dashboard',
href:'/dashboard'
}]),
{label:'Pricing',href:'/pricing'},
{label:'Docs',href:'/docs'}
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
borderBottom:
'1px solid var(--border-soft)'
}}
>

<Link
href="/"
style={{
display:'flex',
gap:10,
textDecoration:'none'
}}
>

<canvas
ref={canvasRef}
style={{
width:40,
height:40
}}
/>

<span
style={{
color:'#fff',
fontWeight:800
}}
>
signal
<span style={{
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

{navLinks.map(item=>(

<Link
key={item.label}
href={item.href}
style={{
textDecoration:'none',
color:
pathname===item.href
?'#fff'
:'var(--text-muted)'
}}
>
{item.label}
</Link>

))}

</div>

<div
style={{
display:'flex',
alignItems:'center',
gap:10
}}
>

<select
value={lang}
onChange={(e)=>
setLang(
e.target.value
)
}
>

{LANGUAGES.map(
l=>(
<option
key={l.code}
value={l.code}
>
{l.label}
</option>
)
)}

</select>

{user ? (

<button
onClick={
handleLogout
}
>
Log out
</button>

):(

<button
onClick={()=>
setShowAuth(true)
}
style={{
background:GOLD,
color:'#000'
}}
>
Get started
</button>

)}

</div>

</nav>

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
