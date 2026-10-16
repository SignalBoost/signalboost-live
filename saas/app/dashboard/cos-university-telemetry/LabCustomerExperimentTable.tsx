'use client'

import { useMemo, useState } from 'react'
import { buildLabExperimentComparison } from '@/lib/lab/labExperimentComparison'
import { summarizeLabProviderOutcomes } from '@/lib/lab/labProviderOutcomeSummary'
import { buildLabExperimentCsv } from '@/lib/lab/labExperimentCsv'
import type { LabRunForTracking } from '@/lib/lab/mlflowRunExport'

const labels: Record<string, readonly string[]> = {
 en:['Compare training runs','Compare runs from the current workspace. Status and artifact identity only; no quality scores are inferred.','Provider','Status','Base model','Trained artifact','Created','All providers','All statuses','No matching runs'],
 es:['Comparar entrenamientos','Comparación de ejecuciones del espacio actual. Sin puntuaciones de calidad inferidas.','Proveedor','Estado','Modelo base','Artefacto','Creado','Todos los proveedores','Todos los estados','Sin resultados'],
 pt:['Comparar treinamentos','Compare execuções deste espaço. Nenhuma pontuação de qualidade é inferida.','Provedor','Estado','Modelo base','Artefato','Criado','Todos os provedores','Todos os estados','Sem resultados'],
 pl:['Porównaj treningi','Porównanie z tego obszaru. Bez domniemanych ocen jakości.','Dostawca','Status','Model bazowy','Artefakt','Utworzono','Wszyscy dostawcy','Wszystkie statusy','Brak wyników'],
 ru:['Сравнить обучения','Сравнение запусков пространства без вымышленных оценок качества.','Провайдер','Статус','Базовая модель','Артефакт','Создано','Все провайдеры','Все статусы','Нет результатов'],
 de:['Trainingsläufe vergleichen','Läufe dieses Arbeitsbereichs; keine erfundenen Qualitätswerte.','Anbieter','Status','Basismodell','Artefakt','Erstellt','Alle Anbieter','Alle Status','Keine Treffer'],
 fr:['Comparer les entraînements','Exécutions de cet espace ; aucun score de qualité déduit.','Fournisseur','Statut','Modèle de base','Artefact','Créé','Tous les fournisseurs','Tous les statuts','Aucun résultat'],
 it:['Confronta gli addestramenti','Esecuzioni dello spazio corrente; nessun punteggio inventato.','Fornitore','Stato','Modello base','Artefatto','Creato','Tutti i fornitori','Tutti gli stati','Nessun risultato'],
 ja:['学習実行を比較','このワークスペースの実行。品質スコアは推定しません。','プロバイダー','状態','基盤モデル','成果物','作成日','すべてのプロバイダー','すべての状態','結果なし'],
 ko:['학습 실행 비교','현재 작업 공간의 실행을 비교합니다. 품질 점수는 추정하지 않습니다.','제공업체','상태','기본 모델','결과물','생성일','모든 업체','모든 상태','결과 없음'],
 ar:['مقارنة عمليات التدريب','مقارنة عمليات مساحة العمل الحالية دون افتراض درجات جودة.','المزود','الحالة','النموذج الأساسي','الناتج','تاريخ الإنشاء','كل المزودين','كل الحالات','لا توجد نتائج'],
}
const outcomeLabels: Record<string, readonly string[]> = {
 en:['runs','finished','failed','running','cancelled','artifact records','Observed training outcomes'],
 es:['ejecuciones','finalizados','fallidos','en curso','cancelados','artefactos','Resultados observados'],
 pt:['execuções','concluídos','falhos','em andamento','cancelados','artefatos','Resultados observados'],
 pl:['uruchomienia','ukończone','nieudane','w toku','anulowane','artefakty','Zaobserwowane wyniki'],
 ru:['запуски','завершено','ошибки','выполняется','отменено','артефакты','Наблюдаемые результаты'],
 de:['Läufe','abgeschlossen','fehlgeschlagen','laufend','abgebrochen','Artefakte','Beobachtete Ergebnisse'],
 fr:['exécutions','terminées','échouées','en cours','annulées','artefacts','Résultats observés'],
 it:['esecuzioni','completati','falliti','in corso','annullati','artefatti','Esiti osservati'],
 ja:['実行','完了','失敗','実行中','中止','成果物','観測された結果'],
 ko:['실행','완료','실패','진행 중','취소','결과물','관측된 결과'],
 ar:['تشغيلات','مكتملة','فاشلة','جارية','ملغاة','آثار نموذجية','نتائج التدريب المرصودة'],
}
const csvLabels: Record<string,string> = {
 en:'Export filtered runs (CSV)',es:'Exportar ejecuciones filtradas (CSV)',
 pt:'Exportar execuções filtradas (CSV)',pl:'Eksportuj wybrane treningi (CSV)',
 ru:'Экспорт отобранных запусков (CSV)',de:'Gefilterte Läufe exportieren (CSV)',
 fr:'Exporter les exécutions filtrées (CSV)',it:'Esporta esecuzioni filtrate (CSV)',
 ja:'絞り込んだ実行をエクスポート（CSV）',ko:'필터링된 실행 내보내기 (CSV)',
 ar:'تصدير التشغيلات المحددة (CSV)',
}
export default function LabCustomerExperimentTable({ runs, language }: { runs: readonly LabRunForTracking[]; language: string }) {
 const [provider, setProvider] = useState('')
 const [status, setStatus] = useState('')
 const [descending, setDescending] = useState(true)
 const copy = labels[language] ?? labels.en
 const outcomeCopy = outcomeLabels[language] ?? outcomeLabels.en
 const comparison = useMemo(() => runs.length ? buildLabExperimentComparison(runs.slice(0,100)) : null, [runs])
 const records = comparison?.runs ?? []
 const providerOutcomes = useMemo(() => summarizeLabProviderOutcomes(runs), [runs])
 const providers = [...new Set(records.map(x => x.computeProvider).filter(Boolean))].sort()
 const statuses = [...new Set(records.map(x => x.state))].sort()
 const filtered = records.filter(x => (!provider || x.computeProvider === provider) && (!status || x.state === status))
 const ordered = descending ? [...filtered].reverse() : filtered
 function downloadCsv() {
  const csv = buildLabExperimentCsv(runs, {provider,status})
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
  const a = document.createElement('a')
  a.href=url; a.download='itmounts-lab-experiments.csv'
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
 }
 return <details className="mt-3 rounded border border-white/20 p-3 text-sm">
  <summary className="cursor-pointer font-medium">{copy[0]} ({records.length})</summary>
  <p className="my-2 text-xs opacity-75">{copy[1]}</p>
  <div className="mb-3 flex flex-wrap gap-2" aria-label={outcomeCopy[6]}>
    {providerOutcomes.map(item => <div key={item.provider} className="rounded border border-white/20 px-3 py-2 text-xs">
      <strong>{item.provider}</strong>
      <div>{item.total} {outcomeCopy[0]} · {item.finished} {outcomeCopy[1]} · {item.failed} {outcomeCopy[2]} · {item.running} {outcomeCopy[3]} · {item.cancelled} {outcomeCopy[4]}</div>
      <div>{item.artifacts} {outcomeCopy[5]}</div>
    </div>)}
  </div>
  <div className="mb-3 flex flex-wrap items-center gap-2">
   <select aria-label={copy[2]} value={provider} onChange={e=>setProvider(e.target.value)} className="max-w-full rounded border bg-slate-900 p-1 text-white"><option value="">{copy[7]}</option>{providers.map(x=><option key={x} value={x}>{x}</option>)}</select>
   <select aria-label={copy[3]} value={status} onChange={e=>setStatus(e.target.value)} className="max-w-full rounded border bg-slate-900 p-1 text-white"><option value="">{copy[8]}</option>{statuses.map(x=><option key={x} value={x}>{x}</option>)}</select>
   <button type="button" className="rounded border px-2 py-1" onClick={()=>setDescending(x=>!x)}>{copy[6]} {descending ? '↓' : '↑'}</button>
   <button type="button" className="rounded border px-2 py-1" onClick={downloadCsv}>{csvLabels[language] ?? csvLabels.en}</button>
  </div>
  <div className="max-w-full overflow-x-auto">
   <table className="w-full min-w-[640px] text-start text-xs"><thead><tr>{[copy[2],copy[3],copy[4],copy[5],copy[6]].map(x=><th key={x} scope="col" className="border-b p-2">{x}</th>)}</tr></thead>
   <tbody>{ordered.map(x=><tr key={x.runId} className="border-b border-white/10"><td className="p-2">{x.computeProvider || '—'}</td><td className="p-2">{x.state}</td><td className="p-2 break-all">{x.baseModel}</td><td className="p-2 break-all">{x.tunedModelId || x.artifactRepo || '—'}{x.artifactRevision && <span className="block opacity-60">{x.artifactRevision}</span>}</td><td className="p-2">{new Date(x.createdAt).toLocaleDateString(language)}</td></tr>)}</tbody></table>
   {!ordered.length && <p className="p-2 text-xs">{copy[9]}</p>}
  </div>
 </details>
}
