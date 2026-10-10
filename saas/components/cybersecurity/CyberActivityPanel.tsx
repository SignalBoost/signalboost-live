'use client'

import { useEffect, useMemo, useState } from 'react'
import { uiText } from '@/lib/i18n/uiText'

export type CyberActivityStatus = 'running' | 'completed' | 'failed'

export type CyberActivityState = {
  operation: 'dependency_scan' | 'monitor' | 'fix_plan' | 'approval' | 'github_pr'
  status: CyberActivityStatus
  stage: string
  progress: number
  message?: string
  startedAt: string
  updatedAt: string
  stageChangedAt: string
  done?: number
  total?: number
  error?: string
}

type Copy = {
  title: string
  active: string
  delayed: string
  stale: string
  stalled: string
  completed: string
  failed: string
  lastActivity: string
  stageChanged: string
  elapsed: string
  progress: string
  stages: Record<string, string>
}

const COPY: Record<string, Copy> = {
  en: {
    title: uiText('generatedUi.u_185aa06ca1580063'), active: uiText('generatedUi.u_8e139f20040fde56'), delayed: uiText('generatedUi.u_c72468acc5be3bd1'), stale: uiText('generatedUi.u_42c600cae23df002'), stalled: uiText('generatedUi.u_6ab6ed6daa457e33'), completed: uiText('generatedUi.u_eec3bfcb8816f1c7'), failed: uiText('generatedUi.u_4e1af7c74096cf0a'), lastActivity: uiText('generatedUi.u_06475633ed3e14cf'), stageChanged: uiText('generatedUi.u_8c3a9d5718aa4208'), elapsed: uiText('generatedUi.u_a194a68a45d32cab'), progress: uiText('generatedUi.u_4664827f8e890192'),
    stages: { starting: uiText('generatedUi.u_e44ece02dc817e3c'), repository: uiText('generatedUi.u_8887a3ea9a55a8f6'), manifests: uiText('generatedUi.u_62ea3404a4d06654'), packages: uiText('generatedUi.u_fed9c4143062f649'), advisories: uiText('generatedUi.u_54812e88eb5f7b3c'), saving: uiText('generatedUi.u_acb0837b71c25b7b'), alerts: uiText('generatedUi.u_8a9c2cbd9a9ce593'), complete: uiText('generatedUi.u_22a970d2e5b1cc23'), monitor: uiText('generatedUi.u_2a4a21cc12fd6de9'), plan: uiText('generatedUi.u_b797eebfa93e9151'), approval: uiText('generatedUi.u_5f3212d14ba38a55'), github_pr: uiText('generatedUi.u_11761b5fd9819e26'), failed: uiText('generatedUi.u_1a4f630ac1b69fd0') },
  },
  es: {
    title: 'Actividad de ciberseguridad en vivo', active: 'Actividad del sistema detectada', delayed: 'La actualización de actividad está retrasada', stale: 'No hay actividad reciente del sistema', stalled: 'No hay progreso — puede ser necesaria la recuperación', completed: 'Operación completada', failed: 'La operación falló', lastActivity: 'Última actividad', stageChanged: 'Cambio de etapa', elapsed: 'Transcurrido', progress: 'Progreso',
    stages: { starting: 'Iniciando operación de ciberseguridad', repository: 'Conectando con GitHub', manifests: 'Leyendo manifiestos de paquetes', packages: 'Creando inventario de dependencias', advisories: 'Consultando avisos de vulnerabilidad', saving: 'Guardando resultados', alerts: 'Actualizando alertas', complete: 'Completado', monitor: 'Guardando monitor del repositorio', plan: 'Preparando plan de remediación', approval: 'Registrando aprobación', github_pr: 'Preparando propuesta protegida en GitHub', failed: 'Detenido' },
  },
  pt: {
    title: 'Atividade de cibersegurança ao vivo', active: 'Atividade do sistema detectada', delayed: 'Atualização de atividade atrasada', stale: 'Nenhuma atividade recente do sistema', stalled: 'Sem progresso — a recuperação pode ser necessária', completed: 'Operação concluída', failed: 'A operação falhou', lastActivity: 'Última atividade', stageChanged: 'Mudança de etapa', elapsed: 'Decorrido', progress: 'Progresso',
    stages: { starting: 'Iniciando operação de cibersegurança', repository: 'Conectando ao GitHub', manifests: 'Lendo manifestos de pacotes', packages: 'Criando inventário de dependências', advisories: 'Consultando avisos de vulnerabilidade', saving: 'Salvando resultados', alerts: 'Atualizando alertas', complete: 'Concluído', monitor: 'Salvando monitor do repositório', plan: 'Preparando plano de correção', approval: 'Registrando aprovação', github_pr: 'Preparando proposta protegida no GitHub', failed: 'Interrompido' },
  },
  pl: {
    title: 'Aktywność cyberbezpieczeństwa na żywo', active: 'Wykryto aktywność systemu', delayed: 'Aktualizacja aktywności jest opóźniona', stale: 'Brak ostatniej aktywności systemu', stalled: 'Brak postępu — może być wymagane odzyskiwanie', completed: 'Operacja zakończona', failed: 'Operacja nie powiodła się', lastActivity: 'Ostatnia aktywność', stageChanged: 'Zmiana etapu', elapsed: 'Czas', progress: 'Postęp',
    stages: { starting: 'Uruchamianie operacji cyberbezpieczeństwa', repository: 'Łączenie z GitHub', manifests: 'Odczytywanie manifestów pakietów', packages: 'Tworzenie spisu zależności', advisories: 'Sprawdzanie ostrzeżeń o podatnościach', saving: 'Zapisywanie wyników', alerts: 'Aktualizowanie alertów', complete: 'Zakończono', monitor: 'Zapisywanie monitora repozytorium', plan: 'Przygotowywanie planu naprawczego', approval: 'Zapisywanie zgody', github_pr: 'Przygotowywanie chronionej propozycji GitHub', failed: 'Zatrzymano' },
  },
  ru: {
    title: 'Активность кибербезопасности в реальном времени', active: 'Обнаружена активность системы', delayed: 'Обновление активности задерживается', stale: 'Нет недавней активности системы', stalled: 'Нет прогресса — может потребоваться восстановление', completed: 'Операция завершена', failed: 'Операция завершилась ошибкой', lastActivity: 'Последняя активность', stageChanged: 'Смена этапа', elapsed: 'Прошло', progress: 'Прогресс',
    stages: { starting: 'Запуск операции кибербезопасности', repository: 'Подключение к GitHub', manifests: 'Чтение манифестов пакетов', packages: 'Формирование списка зависимостей', advisories: 'Проверка предупреждений об уязвимостях', saving: 'Сохранение результатов', alerts: 'Обновление предупреждений', complete: 'Завершено', monitor: 'Сохранение мониторинга репозитория', plan: 'Подготовка плана исправления', approval: 'Регистрация одобрения', github_pr: 'Подготовка защищённого предложения GitHub', failed: 'Остановлено' },
  },
  de: {
    title: 'Live-Cybersicherheitsaktivität', active: 'Systemaktivität erkannt', delayed: 'Aktivitätsaktualisierung verzögert', stale: 'Keine aktuelle Systemaktivität', stalled: 'Kein Fortschritt – möglicherweise ist eine Wiederherstellung erforderlich', completed: 'Vorgang abgeschlossen', failed: 'Vorgang fehlgeschlagen', lastActivity: 'Letzte Aktivität', stageChanged: 'Phase geändert', elapsed: 'Verstrichen', progress: 'Fortschritt',
    stages: { starting: 'Cybersicherheitsvorgang wird gestartet', repository: 'Verbindung mit GitHub wird hergestellt', manifests: 'Paketmanifeste werden gelesen', packages: 'Abhängigkeitsinventar wird erstellt', advisories: 'Sicherheitshinweise zu Schwachstellen werden geprüft', saving: 'Scan-Ergebnisse werden gespeichert', alerts: 'Warnungs-Posteingang wird aktualisiert', complete: 'Abgeschlossen', monitor: 'Repository-Monitor wird gespeichert', plan: 'Behebungsplan wird vorbereitet', approval: 'Aufnahmegenehmigung', github_pr: 'Geschützter GitHub-Vorschlag wird vorbereitet', failed: 'Gestoppt' },
  },
  fr: {
    title: 'Activité de cybersécurité en direct', active: 'Activité système détectée', delayed: 'Mise à jour de l’activité retardée', stale: 'Aucune activité système récente', stalled: 'Aucune progression — une récupération peut être nécessaire', completed: 'Opération terminée', failed: 'Échec de l’opération', lastActivity: 'Dernière activité', stageChanged: 'Étape modifiée', elapsed: 'Écoulé', progress: 'Progression',
    stages: { starting: 'Lancement de l’opération de cybersécurité', repository: 'Connexion à GitHub', manifests: 'Lecture des manifestes de paquets', packages: 'Création de l’inventaire des dépendances', advisories: 'Vérification des avis de vulnérabilité', saving: 'Enregistrement des résultats de l’analyse', alerts: 'Mise à jour de la boîte de réception des alertes', complete: 'Terminé', monitor: 'Enregistrement du moniteur de dépôt', plan: 'Préparation du plan de correction', approval: 'Approbation de l’enregistrement', github_pr: 'Préparation de la proposition GitHub protégée', failed: 'Arrêté' },
  },
  it: {
    title: 'Attività di cybersecurity in tempo reale', active: 'Attività di sistema rilevata', delayed: 'Aggiornamento attività in ritardo', stale: 'Nessuna attività di sistema recente', stalled: 'Nessun avanzamento — potrebbe essere necessario un ripristino', completed: 'Operazione completata', failed: 'Operazione non riuscita', lastActivity: 'Ultima attività', stageChanged: 'Fase modificata', elapsed: 'Trascorso', progress: 'Avanzamento',
    stages: { starting: 'Avvio dell’operazione di cybersicurezza', repository: 'Connessione a GitHub', manifests: 'Lettura dei manifest dei pacchetti', packages: 'Creazione dell’inventario delle dipendenze', advisories: 'Verifica degli avvisi di vulnerabilità', saving: 'Salvataggio dei risultati della scansione', alerts: 'Aggiornamento della casella avvisi', complete: 'Completato', monitor: 'Salvataggio del monitor del repository', plan: 'Preparazione del piano di correzione', approval: 'Approvazione della registrazione', github_pr: 'Preparazione della proposta GitHub protetta', failed: 'Interrotto' },
  },
  ja: {
    title: 'ライブのサイバーセキュリティアクティビティ', active: 'システムアクティビティを検出', delayed: 'アクティビティの更新が遅延しています', stale: '最近のシステムアクティビティはありません', stalled: '進捗がありません — 復旧が必要な可能性があります', completed: '操作が完了しました', failed: '操作に失敗しました', lastActivity: '最終アクティビティ', stageChanged: 'ステージが変更されました', elapsed: '経過時間', progress: '進捗',
    stages: { starting: 'サイバーセキュリティ処理を開始しています', repository: 'GitHub に接続中', manifests: 'パッケージマニフェストを読み込み中', packages: '依存関係インベントリを作成中', advisories: '脆弱性アドバイザリを確認中', saving: 'スキャン結果を保存中', alerts: 'アラート受信箱を更新中', complete: '完了', monitor: 'リポジトリモニターを保存中', plan: '修復計画を準備中', approval: '録音の承認', github_pr: '保護された GitHub 提案を準備中', failed: '停止' },
  },
  ko: {
    title: '실시간 사이버 보안 활동', active: '시스템 활동 감지됨', delayed: '활동 업데이트 지연됨', stale: '최근 시스템 활동 없음', stalled: '진행이 없습니다 — 복구가 필요할 수 있습니다', completed: '작업 완료', failed: '작업 실패', lastActivity: '최근 활동', stageChanged: '단계 변경됨', elapsed: '경과 시간', progress: '진행 상황',
    stages: { starting: '사이버 보안 작업 시작 중', repository: 'GitHub에 연결 중', manifests: '패키지 매니페스트 읽는 중', packages: '종속성 인벤토리 생성 중', advisories: '취약점 권고 확인 중', saving: '스캔 결과 저장 중', alerts: '알림 받은편지함 업데이트 중', complete: '완료됨', monitor: '저장소 모니터 저장 중', plan: '복구 계획 준비 중', approval: '녹음 승인', github_pr: '보호된 GitHub 제안 준비 중', failed: '중지됨' },
  },
  ar: {
    title: 'نشاط الأمن السيبراني المباشر', active: 'تم رصد نشاط في النظام', delayed: 'تأخّر تحديث النشاط', stale: 'لا يوجد نشاط حديث للنظام', stalled: 'لا يوجد تقدّم — قد يلزم إجراء استرداد', completed: 'اكتملت العملية', failed: 'فشلت العملية', lastActivity: 'آخر نشاط', stageChanged: 'تم تغيير المرحلة', elapsed: 'المنقضي', progress: 'التقدم',
    stages: { starting: 'جارٍ بدء عملية الأمن السيبراني', repository: 'جارٍ الاتصال بـ GitHub', manifests: 'قراءة بيانات الحزم', packages: 'جارٍ إنشاء قائمة التبعيات', advisories: 'جارٍ فحص تنبيهات الثغرات الأمنية', saving: 'جارٍ حفظ نتائج الفحص', alerts: 'جارٍ تحديث صندوق التنبيهات', complete: 'مكتمل', monitor: 'جارٍ حفظ مراقب المستودع', plan: 'جارٍ إعداد خطة المعالجة', approval: 'الموافقة على التسجيل', github_pr: 'جارٍ إعداد مقترح GitHub محمي', failed: 'متوقف' },
  },
}

function secondsSince(value: string | undefined, now: number): number | null {
  if (!value || !now) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor((now - parsed) / 1000))
}

function ageLabel(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export default function CyberActivityPanel({ activity, lang }: { activity: CyberActivityState | null; lang: string }) {
  const [now, setNow] = useState(0)

  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const copy = COPY[lang] || COPY.en
  const heartbeatAge = secondsSince(activity?.updatedAt, now)
  const stageAge = secondsSince(activity?.stageChangedAt, now)
  const elapsed = secondsSince(activity?.startedAt, now)

  const state = useMemo(() => {
    if (!activity) return null
    if (activity.status === 'completed') return { label: copy.completed, live: false, color: '#34d399' }
    if (activity.status === 'failed') return { label: copy.failed, live: false, color: '#fca5a5' }
    if (stageAge !== null && stageAge > 900) return { label: copy.stalled, live: false, color: '#fca5a5' }
    if (heartbeatAge !== null && heartbeatAge > 45) return { label: copy.stale, live: false, color: '#fca5a5' }
    if (heartbeatAge !== null && heartbeatAge > 25) return { label: copy.delayed, live: false, color: '#ffc300' }
    return { label: copy.active, live: true, color: '#1af0ff' }
  }, [activity, copy, heartbeatAge, stageAge])

  if (!activity || !state) return null

  const progress = Math.max(0, Math.min(100, Math.round(Number(activity.progress || 0))))
  const stageLabel = copy.stages[activity.stage] || activity.message || activity.stage
  const tone = activity.status === 'failed' || !state.live && progress < 100 ? 'border-danger/45' : activity.status === 'completed' ? 'border-emerald-400/40' : 'border-cyan-400/40'

  return (
    <section className={`mt-4 rounded-md border bg-surface p-4 ${tone}`} aria-live="polite">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: state.color, boxShadow: state.live ? `0 0 14px ${state.color}` : 'none' }} />
            {copy.title}
          </div>
          <p className="mt-1 text-[12px] text-text-muted">{state.label}</p>
        </div>
        <div className="text-end font-mono text-[11px] text-text-muted">
          <div>{copy.progress}: {progress}%</div>
          {typeof activity.done === 'number' && typeof activity.total === 'number' && activity.total > 0 ? <div>{activity.done}/{activity.total}</div> : null}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="font-semibold text-text">{stageLabel}</span>
        <span className="font-mono text-text-muted">{progress}%</span>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full border border-border bg-bg" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={stageLabel}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, background: state.color }} />
        {state.live ? <div className="sb-cyber-progress-flow absolute inset-y-0 w-32 opacity-70" /> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10.5px] text-text-muted">
        <span>{copy.lastActivity}: {ageLabel(heartbeatAge)}</span>
        <span>{copy.stageChanged}: {ageLabel(stageAge)}</span>
        <span>{copy.elapsed}: {ageLabel(elapsed)}</span>
      </div>

      {activity.error ? <p className="mt-2 text-[12px] leading-relaxed text-danger">{activity.error}</p> : null}

      <style>{"\n        @keyframes sbCyberProgressFlow { 0% { transform: translateX(-140%); } 100% { transform: translateX(900%); } }\n        .sb-cyber-progress-flow { background: linear-gradient(90deg, transparent, rgba(255,255,255,.88), transparent); animation: sbCyberProgressFlow 1.35s linear infinite; }\n        @media (prefers-reduced-motion: reduce) { .sb-cyber-progress-flow { animation: none; opacity: 0; } }\n      "}</style>
    </section>
  )
}
