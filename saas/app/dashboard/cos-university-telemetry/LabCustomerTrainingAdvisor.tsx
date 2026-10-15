'use client'
import { useMemo, useState } from 'react'

// Only describes executable configurations; NOT a paid job creator or hyperparameter editor.
// The API remains the sole authority for allowed models, accounts, dataset and billing.
type TrainingProvider = { kind: string; name: string; supports: Record<string, boolean> }
const recipes = [
 { provider: 'huggingface', id: 'hf-jobs', method: 'Hugging Face Jobs fine-tuning', settings: 'Existing LAB worker training profile; parameters fixed by the deployed worker.' },
 { provider: 'together', id: 'together-lora', method: 'Together AI LoRA fine-tuning', settings: '1 epoch; provider-managed LoRA configuration.' },
 { provider: 'fireworks', id: 'fireworks-lora', method: 'Fireworks AI supervised LoRA fine-tuning', settings: '1 epoch; LoRA rank 16.' },
] as const

const copy: Record<string, [string,string,string,string,string,string,string,string,string,string,string,string]> = {
 en:['Training advisor & recipe library','Goal','Domain knowledge','Response format','Lower inference cost','Executable recipe','Connected','Connect a provider account before training','Select its supported base model in the existing form','Read-only guidance. Choosing a recipe does not change the job or start billing.','Dataset ready','Prepare 20–128 distinct examples and review data rights before training.'],
 es:['Asesor y recetas de entrenamiento','Objetivo','Conocimiento especializado','Formato de respuesta','Menor costo de inferencia','Receta ejecutable','Conectado','Conecte su cuenta antes de entrenar','Elija un modelo base compatible en el formulario','Orientación: no cambia trabajos ni inicia pagos.','Datos listos','Prepare 20–128 ejemplos distintos y revise sus derechos.'],
 pt:['Orientador e receitas de treino','Objetivo','Conhecimento específico','Formato de resposta','Menor custo de inferência','Receita executável','Conectado','Conecte a conta antes de treinar','Escolha um modelo base compatível no formulário','Orientação: não altera jobs nem inicia cobranças.','Dados prontos','Prepare 20–128 exemplos distintos e revise os direitos.'],
 pl:['Doradca i przepisy treningowe','Cel','Wiedza branżowa','Format odpowiedzi','Niższy koszt inferencji','Dostępny przepis','Połączono','Połącz konto przed treningiem','Wybierz obsługiwany model bazowy w formularzu','Porada nie zmienia zadań ani nie uruchamia płatności.','Dane gotowe','Przygotuj 20–128 unikalnych przykładów i sprawdź prawa.'],
 ru:['Советник и рецепты обучения','Цель','Предметные знания','Формат ответа','Меньшая цена инференса','Доступный рецепт','Подключено','Подключите аккаунт до обучения','Выберите совместимую базовую модель в форме','Рекомендация не запускает задания и оплату.','Данные готовы','Подготовьте 20–128 уникальных примеров и проверьте права.'],
 de:['Trainingsberater und Rezepte','Ziel','Fachwissen','Antwortformat','Geringere Inferenzkosten','Ausführbares Rezept','Verbunden','Konto vor dem Training verbinden','Unterstütztes Basismodell im Formular wählen','Nur Hinweise: keine Jobänderung oder Abbuchung.','Daten bereit','20–128 unterschiedliche Beispiele und Rechte prüfen.'],
 fr:['Conseiller et recettes d’entraînement','Objectif','Connaissances métier','Format des réponses','Inférence moins coûteuse','Recette exécutable','Connecté','Connectez votre compte avant de démarrer','Choisissez un modèle de base compatible','Conseil uniquement : aucun travail ni paiement lancé.','Données prêtes','Préparez 20–128 exemples distincts et vérifiez les droits.'],
 it:['Consulente e ricette di training','Obiettivo','Conoscenza del dominio','Formato delle risposte','Costo inferenza ridotto','Ricetta eseguibile','Collegato','Collega il tuo account prima del training','Scegli un modello base supportato','Solo consigli: nessun lavoro o costo avviato.','Dati pronti','Prepara 20–128 esempi distinti e verifica i diritti.'],
 ja:['学習アドバイザーとレシピ','目標','専門知識','回答形式','推論コスト削減','実行可能なレシピ','接続済み','学習前にアカウントを接続','フォームで対応する基盤モデルを選択','案内のみ。ジョブや課金は開始しません。','データ準備完了','重複しない20〜128例と利用権を確認してください。'],
 ko:['학습 조언 및 레시피','목표','전문 지식','응답 형식','추론 비용 절감','실행 가능한 레시피','연결됨','학습 전 계정 연결','기존 양식에서 지원 모델 선택','안내만 제공하며 작업 및 청구는 시작되지 않습니다.','데이터 준비','서로 다른 예제 20~128개와 사용 권한을 확인하세요.'],
 ar:['مستشار التدريب والوصفات','الهدف','معرفة متخصصة','تنسيق الإجابة','تكلفة استدلال أقل','وصفة قابلة للتنفيذ','متصل','اربط حساب المزود قبل التدريب','اختر النموذج الأساسي المدعوم في النموذج','إرشاد فقط؛ لا يبدأ التدريب أو الدفع.','البيانات جاهزة','جهز 20 إلى 128 مثالاً مختلفاً وتحقق من الحقوق.'],
}
export default function LabCustomerTrainingAdvisor({language, catalog, connectedKinds, selectedKind, ready}:{
 language: string; catalog: TrainingProvider[]; connectedKinds: ReadonlySet<string>; selectedKind: string; ready: boolean
}) {
 const t=copy[language] ?? copy.en
 const [goal,setGoal]=useState('domain')
 const available=useMemo(()=>recipes.filter(r=>catalog.some(p=>p.kind===r.provider && p.supports['training.execute'])),[catalog])
 const ranked=[...available].sort((a,b)=>Number(b.provider===selectedKind)-Number(a.provider===selectedKind) || Number(connectedKinds.has(b.provider))-Number(connectedKinds.has(a.provider)))
 return <section className="rounded-lg border border-white/20 p-3 text-sm" aria-label={t[0]}>
  <h3 className="font-semibold">{t[0]}</h3>
  <label className="mt-2 block">{t[1]}<select value={goal} onChange={e=>setGoal(e.target.value)} className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-2 text-white">
   <option value="domain">{t[2]}</option><option value="format">{t[3]}</option><option value="cost">{t[4]}</option>
  </select></label>
  {goal==='cost' && <p className="mt-2 text-xs text-amber-200"> {t[9]} {t[8]}</p>}
  <div className="mt-3 grid gap-2 sm:grid-cols-3">{ranked.map(r=><div className="rounded border border-white/20 p-2" key={r.id}>
   <strong className="block">{catalog.find(p=>p.kind===r.provider)?.name}</strong><span className="block text-xs">{t[5]}: {r.method}</span>
   <p className="mt-1 text-xs opacity-80">{r.settings}</p>
   <p className="mt-1 text-xs">{connectedKinds.has(r.provider)?t[6]:t[7]}</p>
  </div>)}</div>
  <p className="mt-2 text-xs">{ready?t[10]:t[11]}</p>
  <p className="mt-1 text-xs opacity-75">{t[8]} · {t[9]}</p>
 </section>
}
