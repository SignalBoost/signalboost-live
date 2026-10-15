'use client'

// Displays only tenant-scoped fields already returned by the authenticated run list.
// A completed provider job is NOT independently evaluated.
type PassportRun = {
  runId: string; stage: string; createdAt: string; teacherProviderKind: string; teacherModel: string;
  computeProviderKind?: string; baseModel: string; artifactRepo: string | null;
  artifactRevision: string | null; artifactHash?: string | null; tunedModelId?: string | null;
}
const labels: Record<string, string[]> = {
  en: ['Model passport', 'Run', 'Teacher', 'Training provider', 'Base model', 'Trained model', 'Artifact repository', 'Revision', 'Artifact fingerprint', 'Evaluation', 'No independently verified baseline comparison available', 'Training status', 'Recorded'],
  es: ['Pasaporte del modelo','Ejecución','Profesor','Proveedor de entrenamiento','Modelo base','Modelo entrenado','Repositorio','Revisión','Huella del artefacto','Evaluación','No hay comparación independiente verificada','Estado','Registrado'],
  pt: ['Passaporte do modelo','Execução','Professor','Provedor de treino','Modelo base','Modelo treinado','Repositório','Revisão','Identidade do artefato','Avaliação','Sem comparação independente verificada','Estado','Registrado'],
  pl: ['Paszport modelu','Uruchomienie','Nauczyciel','Dostawca treningu','Model bazowy','Wytrenowany model','Repozytorium','Wersja','Odcisk artefaktu','Ocena','Brak niezależnie potwierdzonego porównania','Stan','Zapisano'],
  ru: ['Паспорт модели','Запуск','Учитель','Провайдер обучения','Базовая модель','Обученная модель','Репозиторий','Ревизия','Отпечаток артефакта','Оценка','Нет независимо подтверждённого сравнения','Статус','Записано'],
  de: ['Modellpass','Lauf','Lehrmodell','Trainingsanbieter','Basismodell','Trainiertes Modell','Repository','Revision','Artefakt-Fingerabdruck','Bewertung','Kein unabhängig verifizierter Vergleich vorhanden','Status','Erfasst'],
  fr: ['Passeport du modèle','Exécution','Enseignant','Fournisseur d’entraînement','Modèle de base','Modèle entraîné','Dépôt','Révision','Empreinte de l’artefact','Évaluation','Aucune comparaison indépendante vérifiée','Statut','Enregistré'],
  it: ['Passaporto del modello','Esecuzione','Insegnante','Fornitore training','Modello base','Modello addestrato','Repository','Revisione','Impronta artefatto','Valutazione','Nessun confronto indipendente verificato','Stato','Registrato'],
  ja: ['モデルパスポート','実行','教師モデル','学習プロバイダー','ベースモデル','学習済みモデル','リポジトリ','リビジョン','成果物の指紋','評価','独立検証済みの比較はありません','状態','記録日時'],
  ko: ['모델 여권','실행','교사 모델','학습 공급자','기본 모델','학습된 모델','저장소','리비전','아티팩트 지문','평가','독립적으로 검증된 비교 결과 없음','상태','기록'],
  ar: ['جواز النموذج','التشغيل','نموذج المعلم','مزود التدريب','النموذج الأساسي','النموذج المدرّب','المستودع','المراجعة','بصمة الأثر','التقييم','لا تتوفر مقارنة مستقلة موثقة','الحالة','مسجل'],
}
export default function LabCustomerModelPassport({ run, language }: { run: PassportRun; language: string }) {
  const l = labels[language] ?? labels.en
  const fields: [string, string | null | undefined][] = [
    [l[1], run.runId], [l[2], `${run.teacherProviderKind} / ${run.teacherModel}`],
    [l[3], run.computeProviderKind], [l[4], run.baseModel],
    [l[5], run.tunedModelId], [l[6], run.artifactRepo],
    [l[7], run.artifactRevision], [l[8], run.artifactHash],
    [l[11], run.stage], [l[12], run.createdAt],
  ]
  return <details className="mt-3 rounded border border-white/20 p-3 text-xs">
    <summary className="cursor-pointer font-semibold">{l[0]}</summary>
    <dl className="mt-2 grid gap-2 sm:grid-cols-2">{fields.map(([name,value]) =>
      <div key={name} className="min-w-0"><dt className="opacity-70">{name}</dt><dd className="break-all font-mono">{value || '—'}</dd></div>
    )}</dl>
    <p className="mt-2 text-amber-200">{l[9]}: {l[10]}</p>
  </details>
}
