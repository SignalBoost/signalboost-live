'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

const QUICK=[
{label:'🎥 Create videos',prompt:'How do I create videos?'},
{label:'⚡ Credits',prompt:'Explain my credits system'},
{label:'📈 Growth ideas',prompt:'Give me growth ideas for my business'},
{label:'💬 Support',prompt:'I need help using SignalBoost'}]

export default function Concierge(){
const pathname=usePathname()
const [open,setOpen]=useState(false)
const [message,setMessage]=useState("Hi, I'm your SignalBoost concierge.")
const [loading,setLoading]=useState(false)
const [input,setInput]=useState('')

 async function ask(q:string){
  if(!q.trim()||loading) return
  setLoading(true)
  try{
    const r=await fetch('/api/support',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        messages:[{role:'user',content:q}],
        context:{currentPage:pathname}
      })
    })
    const data=await r.json()
    setMessage(data.reply||'I could not generate a response.')
  }catch{
    setMessage('Connection problem. Please try again.')
  }
  setLoading(false)
 }
 return <>
 <button type='button' onClick={()=>setOpen(v=>!v)} style={{position:'fixed',right:24,bottom:24,zIndex:999999,border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:10,padding:'14px 18px',borderRadius:999,background:'linear-gradient(135deg,#ffc300,#ff9500)',color:'#111',fontWeight:800}}>✨ Concierge</button>
 {open&&<div className='sb-card' style={{position:'fixed',right:24,bottom:100,zIndex:999999,width:420,maxWidth:'calc(100vw - 30px)',padding:20,color:'white'}}>
 <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}><strong>SignalBoost Concierge</strong><button onClick={()=>setOpen(false)} style={{background:'transparent',border:'none',color:'white'}}>×</button></div>
 <div style={{padding:16,borderRadius:12,background:'rgba(255,255,255,.05)',marginBottom:14,lineHeight:1.6}}>{loading?'Thinking...':message}</div>
 <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
 {QUICK.map(q=><button key={q.label} className='sb-button-ghost' onClick={()=>ask(q.prompt)}>{q.label}</button>)}
 </div>
 <div style={{display:'flex',gap:8}}>
 <input value={input} onChange={e=>setInput(e.target.value)} className='sb-input' style={{flex:1,padding:12}} placeholder='Ask anything...'/>
 <button className='sb-button-primary' onClick={()=>{ask(input);setInput('')}}>Send</button>
 </div>
 </div>}
 </>
}
