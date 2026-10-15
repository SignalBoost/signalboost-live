'use client'
import { useMemo, useState } from 'react'
import { scoreCustomerHoldout } from '@/lib/lab/labCustomerHoldoutScore'
import { inspectHoldoutLeakage } from '@/lib/lab/labCustomerHoldoutLeakage'
import { customerHoldoutEvidence } from '@/lib/lab/labCustomerHoldoutEvidence'

const label: Record<string, string[]> = {
 en:['Held-out answer scoring','Paste one JSON object per line with prompt, expected, base and trained. Outputs must be generated separately on the SAME held-out prompts. Exact match only; no model calls, independent validation or persistence.','Score provided answers','Base exact-match','Trained exact-match','Difference','Evaluation data stays in this browser. Results do not prove generalized improvement.'],
 es:['Puntuación de prueba reservada','Pegue líneas JSON con prompt, expected, base y trained. Respuestas obtenidas por separado a las mismas preguntas. Solo coincidencia exacta; sin llamadas ni verificación independiente.','Calcular','Exactitud base','Exactitud entrenado','Diferencia','Los datos permanecen en el navegador. No demuestra una mejora general.'],
 pt:['Pontuação de teste reservado','Cole linhas JSON com prompt, expected, base e trained. Respostas obtidas separadamente para as mesmas perguntas. Apenas correspondência exata.','Calcular','Acertos base','Acertos treinado','Diferença','Dados locais; não prova melhoria geral.'],
 pl:['Ocena danych testowych','Wklej wiersze JSON z prompt, expected, base i trained. Oba modele muszą odpowiadać na te same pytania. Tylko dokładne dopasowanie.','Oceń','Bazowy','Trenowany','Różnica','Dane lokalne; nie dowodzi ogólnej poprawy.'],
 ru:['Оценка отложенных ответов','Вставьте строки JSON с prompt, expected, base и trained. Ответы должны относиться к одним запросам. Только точное совпадение.','Оценить','Базовая точность','Обученная точность','Разница','Данные локальные, улучшение не доказано.'],
 de:['Testantworten bewerten','JSON-Zeilen mit prompt, expected, base und trained einfügen. Beide Antworten müssen zum selben Prompt gehören. Nur exakte Übereinstimmung.','Auswerten','Basis-Treffer','Trainiert-Treffer','Differenz','Daten bleiben lokal; keine allgemeine Verbesserung belegt.'],
 fr:['Évaluer les réponses de test','Collez des lignes JSON avec prompt, expected, base et trained. Même question pour les deux modèles; correspondance exacte uniquement.','Évaluer','Base exacte','Entraîné exact','Différence','Données locales; aucune amélioration générale démontrée.'],
 it:['Valutare risposte di test','Incolla righe JSON con prompt, expected, base e trained. Stesso prompt per entrambi i modelli; solo corrispondenza esatta.','Valuta','Base esatta','Addestrato esatto','Differenza','Dati locali; nessun miglioramento generale dimostrato.'],
 ja:['保留テスト回答の採点','prompt、expected、base、trainedを含むJSON行を貼り付け。同一質問の回答を別途取得してください。完全一致のみ。','採点','基盤一致率','学習済み一致率','差','データはローカルのみ。一般的改善の証明ではありません。'],
 ko:['보류 평가 응답 채점','prompt, expected, base, trained가 있는 JSON 행을 붙여 넣으세요. 두 모델은 같은 질문에 답해야 합니다. 완전 일치만 계산합니다.','채점','기본 일치율','학습 일치율','차이','데이터는 로컬에만 유지됩니다. 일반 개선을 증명하지 않습니다.'],
 ar:['تقييم الإجابات المحجوزة','الصق صفوف JSON تتضمن prompt وexpected وbase وtrained. يجب أن تكون الإجابات للسؤال نفسه. تطابق حرفي فقط.','احسب','تطابق الأساسي','تطابق المدرب','الفرق','البيانات محلية ولا تثبت تحسناً عاماً.'],
}
export default function LabCustomerHoldoutEvaluation({language,runId,baseModel,trainedModel}:{language:string;runId:string;baseModel:string;trainedModel:string}){
 const t=label[language]??label.en
 const [raw,setRaw]=useState('')
 const [training,setTraining]=useState('')
 const [requested,setRequested]=useState(false)
 const result=useMemo(()=>{if(!requested)return null;try{const leakage=inspectHoldoutLeakage(training,raw); if(!leakage.safeToScore)throw new Error(leakage.overlappingPrompts ? `holdout_training_overlap: ${leakage.overlappingPrompts}` : 'training_and_holdout_prompts_required'); const score=scoreCustomerHoldout(raw); return {score,evidence:customerHoldoutEvidence({runId,baseModel,trainedModel,score,leakage}),error:null}}catch(e){return {score:null,evidence:null,error:e instanceof Error?e.message:'invalid'}}},[raw,training,requested,runId,baseModel,trainedModel])
 const percent=(n:number)=>`${(n*100).toFixed(1)}%`
 return <details className="mt-3 rounded border border-white/20 p-3 text-sm">
  <summary className="cursor-pointer font-semibold">{t[0]}</summary>
  <p className="mt-2 text-xs">{t[1]}</p>
  <label className="mt-2 block text-xs">Training examples JSONL (prompt fields only used for local overlap detection)<textarea aria-label="Training examples JSONL" value={training} onChange={e=>{setTraining(e.target.value);setRequested(false)}} placeholder='{"prompt":"a training question","response":"answer"}' className="mt-1 h-24 w-full rounded border bg-transparent p-2 font-mono text-xs" /></label>
  <textarea aria-label={t[0]} value={raw} onChange={e=>{setRaw(e.target.value);setRequested(false)}} placeholder='{"prompt":"2+2?","expected":"4","base":"5","trained":"4"}' className="mt-2 h-36 w-full rounded border bg-transparent p-2 font-mono text-xs" />
  <button type="button" disabled={!raw.trim() || !training.trim()} className="mt-2 rounded border px-3 py-1" onClick={()=>setRequested(true)}>{t[2]}</button>
  {result?.error&&<p role="alert" className="mt-2 text-xs text-amber-200">{result.error}</p>}
  {result?.score&&<p role="status" className="mt-2 text-xs">{result.score.total} · {t[3]}: {percent(result.score.baseAccuracy)} · {t[4]}: {percent(result.score.trainedAccuracy)} · {t[5]}: {percent(result.score.delta)}</p>}
  {result?.evidence&&<details className="mt-2"><summary className="cursor-pointer text-xs font-semibold">Evaluation evidence (self-reported JSON)</summary><textarea aria-label="Evaluation evidence JSON" readOnly value={JSON.stringify(result.evidence,null,2)} className="mt-1 h-48 w-full rounded border bg-transparent p-2 font-mono text-xs" /></details>}
  <p className="mt-2 text-xs opacity-70">{t[6]}</p>
 </details>
}
