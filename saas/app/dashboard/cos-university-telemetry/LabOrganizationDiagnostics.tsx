'use client'
import { useState } from 'react'
type Metrics={windowDays:number;totalRuns:number;stages:{stage:string;count:number}[];failures:{category:string;count:number}[]}
const labels:Record<string,[string,string,string,string,string,string]>={
en:['Training reliability','Load 30-day summary','Runs','Stages','Failure categories','No private prompts, model names, credentials or provider messages are shown.'],
es:['Fiabilidad del entrenamiento','Ver resumen de 30 días','Ejecuciones','Etapas','Categorías de errores','No se muestran datos privados ni claves.'],
pt:['Confiabilidade do treinamento','Ver resumo de 30 dias','Execuções','Etapas','Categorias de falhas','Dados privados e chaves não são exibidos.'],
pl:['Niezawodność treningu','Podsumowanie 30 dni','Uruchomienia','Etapy','Kategorie błędów','Prywatne dane i klucze są ukryte.'],
ru:['Надёжность обучения','Сводка за 30 дней','Запуски','Этапы','Категории ошибок','Личные данные и ключи не отображаются.'],
de:['Trainingszuverlässigkeit','30-Tage-Übersicht','Läufe','Phasen','Fehlerkategorien','Keine privaten Daten oder Schlüssel.'],
fr:['Fiabilité de l’entraînement','Résumé sur 30 jours','Exécutions','Étapes','Catégories d’erreurs','Aucune donnée privée ni clé affichée.'],
it:['Affidabilità del training','Riepilogo di 30 giorni','Esecuzioni','Fasi','Categorie di errore','Nessun dato privato o chiave mostrata.'],
ja:['学習の信頼性','30日間の概要を表示','実行数','ステージ','障害カテゴリ','個人情報や鍵は表示されません。'],
ko:['학습 안정성','30일 요약 보기','실행','단계','오류 분류','개인 정보와 키는 표시되지 않습니다.'],
ar:['موثوقية التدريب','عرض ملخص 30 يوماً','عمليات التشغيل','المراحل','فئات الأعطال','لا تظهر بيانات خاصة أو مفاتيح.']
}
export default function LabOrganizationDiagnostics({organizationId,language}:{organizationId:string;language:string}){
 const t=labels[language]??labels.en
 const [data,setData]=useState<Metrics|null>(null)
 const [error,setError]=useState(false)
 const [busy,setBusy]=useState(false)
 async function load(){
  setBusy(true);setError(false)
  try{
   const r=await fetch('/api/lab/training/diagnostics?'+new URLSearchParams({organizationId}),{cache:'no-store'})
   const j=await r.json()
   if(!r.ok||!j.ok||!j.diagnostics)throw new Error('diagnostics_unavailable')
   setData(j.diagnostics)
  }catch{setData(null);setError(true)}finally{setBusy(false)}
 }
 return <section className="rounded border border-white/20 p-3 text-sm"><h3 className="font-semibold">{t[0]}</h3>
  <p className="mt-1 text-xs opacity-75">{t[5]}</p>
  <button type="button" disabled={busy} className="mt-2 rounded border px-3 py-1" onClick={()=>{void load()}}>{t[1]}</button>
  {error&&<p role="alert" className="mt-2 text-amber-200">Unavailable</p>}
  {data&&<div className="mt-3 space-y-2"><p>{t[2]}: {data.totalRuns}</p>
   <div><strong>{t[3]}</strong><ul>{data.stages.map(x=><li key={x.stage}>{x.stage}: {x.count}</li>)}</ul></div>
   <div><strong>{t[4]}</strong><ul>{data.failures.map(x=><li key={x.category}>{x.category}: {x.count}</li>)}</ul></div>
  </div>}
 </section>
}
