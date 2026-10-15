'use client'
import { useState } from 'react'

// Customer-operated blind review of two responses to the same prompt.
// No model inference, provider charges, persistence, or automatic quality claim.
const copy: Record<string, string[]> = {
 en:['Compare responses','Manual comparison: paste real outputs from your base and trained models for the same prompt. This does not run models or verify improvement.','Shared prompt','Base model response','Trained model response','Which response is better?','Not evaluated','Base','Trained','Tie','Local review only; not an independent evaluation.'],
 es:['Comparar respuestas','Comparación manual: pegue respuestas reales de ambos modelos a la misma pregunta. No ejecuta modelos ni verifica mejoras.','Pregunta común','Respuesta del modelo base','Respuesta del modelo entrenado','¿Qué respuesta es mejor?','Sin evaluar','Base','Entrenado','Empate','Revisión local; no es evaluación independiente.'],
 pt:['Comparar respostas','Comparação manual: cole saídas reais dos dois modelos à mesma pergunta. Não executa modelos nem comprova melhoria.','Pergunta comum','Resposta do modelo base','Resposta do modelo treinado','Qual resposta é melhor?','Não avaliado','Base','Treinado','Empate','Revisão local; não é avaliação independente.'],
 pl:['Porównaj odpowiedzi','Porównanie ręczne: wklej rzeczywiste odpowiedzi obu modeli na to samo pytanie. Nie uruchamia modeli ani nie dowodzi poprawy.','Wspólne pytanie','Odpowiedź modelu bazowego','Odpowiedź modelu po treningu','Która jest lepsza?','Nie oceniono','Bazowy','Trenowany','Remis','Ocena lokalna, nie niezależna.'],
 ru:['Сравнить ответы','Ручное сравнение: вставьте реальные ответы обеих моделей на один запрос. Модели здесь не запускаются; улучшение не подтверждается.','Общий запрос','Ответ базовой модели','Ответ обученной модели','Какой ответ лучше?','Не оценено','Базовая','Обученная','Ничья','Локальная оценка, не независимая экспертиза.'],
 de:['Antworten vergleichen','Manueller Vergleich: echte Antworten beider Modelle auf denselben Prompt einfügen. Kein Modellaufruf und kein Nachweis einer Verbesserung.','Gemeinsamer Prompt','Basismodellantwort','Trainierte Modellantwort','Welche Antwort ist besser?','Nicht bewertet','Basis','Trainiert','Gleichstand','Lokale Sichtung, keine unabhängige Evaluation.'],
 fr:['Comparer les réponses','Comparaison manuelle : collez les réponses réelles des deux modèles à la même question. Aucun modèle exécuté ni gain vérifié.','Question commune','Réponse du modèle de base','Réponse du modèle entraîné','Quelle réponse est meilleure ?','Non évalué','Base','Entraîné','Égalité','Examen local, pas une évaluation indépendante.'],
 it:['Confronta risposte','Confronto manuale: incolla le risposte reali dei due modelli allo stesso prompt. Nessuna esecuzione o miglioramento verificato.','Prompt comune','Risposta modello base','Risposta modello addestrato','Quale risposta è migliore?','Non valutato','Base','Addestrato','Pari','Revisione locale, non valutazione indipendente.'],
 ja:['回答を比較','手動比較：同じプロンプトに対する両モデルの実際の回答を貼り付けます。ここでは推論せず、改善は検証されません。','共通プロンプト','基盤モデルの回答','学習済みモデルの回答','どちらが良いですか？','未評価','基盤','学習済み','同点','ローカル確認であり独立評価ではありません。'],
 ko:['응답 비교','수동 비교: 같은 질문에 대한 두 모델의 실제 응답을 붙여 넣으세요. 모델 실행이나 개선 검증은 하지 않습니다.','공통 질문','기본 모델 응답','학습 모델 응답','어느 답변이 더 좋나요?','평가 안 됨','기본','학습','동점','로컬 검토이며 독립 평가가 아닙니다.'],
 ar:['مقارنة الإجابات','مقارنة يدوية: الصق الردود الفعلية من النموذجين للسؤال نفسه. لا يتم تشغيل النماذج أو إثبات التحسن.','السؤال المشترك','رد النموذج الأساسي','رد النموذج المدرّب','أي الردين أفضل؟','لم يُقيّم','الأساسي','المدرّب','تعادل','مراجعة محلية وليست تقييماً مستقلاً.'],
}
export default function LabCustomerResponseComparison({ language, baseModel, trainedModel }: { language: string; baseModel: string; trainedModel: string }) {
 const c = copy[language] ?? copy.en
 const [prompt, setPrompt] = useState('')
 const [base, setBase] = useState('')
 const [trained, setTrained] = useState('')
 const [vote, setVote] = useState('')
 const valid = !!prompt.trim() && !!base.trim() && !!trained.trim()
 return <details className="mt-3 rounded border border-white/20 p-3 text-sm">
  <summary className="cursor-pointer font-semibold">{c[0]}</summary>
  <p className="mt-2 text-xs opacity-80">{c[1]}</p>
  <label className="mt-3 block">{c[2]}<textarea aria-label={c[2]} className="mt-1 w-full rounded border bg-transparent p-2" value={prompt} maxLength={4000} onChange={e => { setPrompt(e.target.value); setVote('') }} /></label>
  <div className="mt-2 grid gap-3 md:grid-cols-2">
   <label className="min-w-0">{c[3]} ({baseModel})<textarea aria-label={c[3]} className="mt-1 h-40 w-full rounded border bg-transparent p-2" value={base} maxLength={20000} onChange={e => { setBase(e.target.value); setVote('') }} /></label>
   <label className="min-w-0">{c[4]} ({trainedModel})<textarea aria-label={c[4]} className="mt-1 h-40 w-full rounded border bg-transparent p-2" value={trained} maxLength={20000} onChange={e => { setTrained(e.target.value); setVote('') }} /></label>
  </div>
  <fieldset disabled={!valid} className="mt-2"><legend>{c[5]}</legend><div className="flex flex-wrap gap-3">{['base','trained','tie'].map((value,i)=><label key={value} className="inline-flex items-center gap-1"><input type="radio" name={`comparison-${baseModel}-${trainedModel}`} checked={vote===value} onChange={()=>setVote(value)} />{c[7+i]}</label>)}</div></fieldset>
  <p className="mt-2 text-xs opacity-70">{c[10]} {vote && valid ? `· ${c[7+['base','trained','tie'].indexOf(vote)]}` : `· ${c[6]}`}</p>
 </details>
}
