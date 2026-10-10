'use client'
import {useState} from 'react'
import { uiText } from '@/lib/i18n/uiText'


/** Explicitly owner-initiated, unfunded provisioning; never auto-creates a tenant. */
export default function LabOwnerActivationPanel({onActivated}:{onActivated?:()=>void}){
 const [name,setName]=useState('')
 const [confirmed,setConfirmed]=useState(false)
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 async function activate(){
  if(busy||!confirmed||!name.trim())return
  setBusy(true);setMessage('')
  try{
   const response=await fetch('/api/admin/lab-phase-observability/provision',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({organizationName:name.trim(),confirmActivation:true}),
   })
   const result=await response.json()
   if(!response.ok||!result.ok)throw Error('Owner activation failed. No organization was confirmed.')
   setMessage('Lab organization activated with zero funded credits. Deployment monitoring scope must still be configured.')
   onActivated?.()
  }catch(e){setMessage(e instanceof Error?e.message:'Activation unavailable')}
  finally{setBusy(false)}
 }
 return <section className="mt-3 rounded-sm border p-3" aria-label={uiText('generatedUi.u_34ec4f997a4d2491')}>
  <h3 className="text-sm font-semibold">{uiText('generatedUi.u_0adbb2c4fa38b8c8')}</h3>
  <p className="mt-1 text-xs opacity-70">{uiText('generatedUi.u_4b7fab635787dc12')}</p>
  <label className="mt-3 block text-xs" htmlFor="lab-org-activation-name">{uiText('generatedUi.u_9a807d52ba21603e')}</label>
  <input id="lab-org-activation-name" className="mt-1 w-full max-w-md rounded-sm border bg-transparent p-2 text-sm" maxLength={120} value={name} onChange={e=>setName(e.target.value)} />
  <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{uiText('generatedUi.u_883e1d181825fc95')}</label>
  <button type="button" disabled={!confirmed||!name.trim()||busy} onClick={()=>void activate()} className="mt-3 rounded-sm border px-3 py-2 text-sm disabled:opacity-50">{busy?uiText('generatedUi.u_230f6d1b67f9fd86'):uiText('generatedUi.u_037465dcca1d5d67')}</button>
  {message?<p role="status" className="mt-2 text-xs">{message}</p>:null}
 </section>
}
