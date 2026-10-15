'use client'
import { useState } from 'react'
type EventRow={sequence:number;event:string;actor:string;recordedAt:string}
const labels:Record<string,[string,string,string,string]>={
 en:['Training event history','Load history','Could not load history','Only event categories are displayed; private provider and customer details are excluded.'],
 es:['Historial de eventos','Cargar historial','No se pudo cargar','Solo se muestran categorías; se excluyen datos privados.'],
 pt:['Histórico de eventos','Carregar histórico','Não foi possível carregar','Apenas categorias; detalhes privados excluídos.'],
 pl:['Historia zdarzeń','Wczytaj historię','Nie udało się wczytać','Tylko kategorie zdarzeń, bez danych prywatnych.'],
 ru:['История событий','Загрузить','Не удалось загрузить','Только категории событий, без частных данных.'],
 de:['Ereignisverlauf','Verlauf laden','Laden fehlgeschlagen','Nur Ereigniskategorien, keine privaten Details.'],
 fr:['Historique des événements','Charger','Chargement impossible','Catégories seulement, sans données privées.'],
 it:['Cronologia eventi','Carica','Caricamento non riuscito','Solo categorie, nessun dato privato.'],
 ja:['イベント履歴','履歴を読み込む','読み込みに失敗','カテゴリのみ。個人情報は表示されません。'],
 ko:['이벤트 기록','기록 불러오기','불러오기 실패','분류만 표시하고 비공개 정보는 제외합니다.'],
 ar:['سجل الأحداث','تحميل السجل','تعذر التحميل','تظهر فئات الأحداث فقط دون تفاصيل خاصة.']
}
export default function LabCustomerRunTimeline({organizationId,runId,language}:{organizationId:string;runId:string;language:string}){
 const t=labels[language]??labels.en
 const [events,setEvents]=useState<EventRow[]|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState(false)
 async function load(){
  setBusy(true);setError(false)
  try{
   const q=new URLSearchParams({organizationId,runId})
   const r=await fetch('/api/lab/training/trace?'+q.toString(),{cache:'no-store'})
   const j=await r.json()
   if(!r.ok||j.ok!==true||!Array.isArray(j.events))throw new Error('trace_unavailable')
   setEvents(j.events)
  }catch{setError(true);setEvents(null)}finally{setBusy(false)}
 }
 return <details className="mt-3 rounded border border-white/20 p-3 text-xs">
  <summary className="cursor-pointer font-semibold">{t[0]}</summary>
  <p className="mt-2 opacity-75">{t[3]}</p>
  <button type="button" disabled={busy} onClick={()=>{void load()}} className="mt-2 rounded border px-2 py-1">{t[1]}</button>
  {error&&<p role="alert">{t[2]}</p>}
  {events&&<ol className="mt-2 space-y-1">{events.map(e=><li key={e.sequence} className="break-words">{new Date(e.recordedAt).toLocaleString(language)} · {e.event.replace(/_/g,' ')} · {e.actor}</li>)}</ol>}
 </details>
}
