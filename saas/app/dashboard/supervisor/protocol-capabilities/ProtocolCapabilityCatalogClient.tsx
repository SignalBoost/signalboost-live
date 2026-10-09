'use client'


import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { uiText } from '@/lib/i18n/uiText'

const STALE_AFTER_MS = 5 * 60 * 1000

type Snapshot = {
  generatedAt: string
  summary: { protocols: number; mutatingProtocols: number; supervisoryOnlyProtocols: number; safetyClassifiedProtocols: number }
  protocols: Array<{ protocolId: string; version: string; domain: string; operations: string[]; mutating: boolean; safetyHints: string[]; evidence: string[]; supervisoryOnly: boolean }>
  safety: { readOnly: true; executionControlsExposed: false; mutationControlsExposed: false }
  schemaVersion: string
}

export type ProtocolCatalogLabels = {
  title: string; adminRequired: string; subtitle: string; loading: string; unavailable: string
  protocols: string; mutating: string; supervisoryOnly: string; safetyClassified: string
  operations: string; safetyHints: string; evidence: string
  mutatingBoundary: string; nonMutating: string; supervisoryBoundary: string; softwareBoundary: string
  footer: string; protocolSummary: string; generated: string; schema: string
  freshSnapshot: string; staleSnapshot: string; invalidSnapshot: string
}

const dictionaries: Record<string, ProtocolCatalogLabels> = {
  en: { title:uiText('generatedUi.u_053ca4679001f633'), adminRequired:'Administrator access is required.', subtitle:uiText('generatedUi.u_37421ff7f46d683e'), loading:'Loading protocol capabilities…', unavailable:'Protocol capability diagnostics unavailable', protocols:'Protocols', mutating:'Mutating', supervisoryOnly:'Supervisory only', safetyClassified:'Safety classified', operations:'Operations', safetyHints:'Safety hints', evidence:'Evidence', mutatingBoundary:'May describe mutating operations', nonMutating:'Non-mutating protocol', supervisoryBoundary:'Supervisory boundary only', softwareBoundary:'Software boundary', footer:'Read-only diagnostics. Execution controls exposed: no. Mutation controls exposed: no.', protocolSummary:'Protocol summary', generated:'Generated', schema:'Schema', freshSnapshot:'Fresh snapshot', staleSnapshot:'Stale snapshot', invalidSnapshot:'Invalid snapshot timestamp' },
  es: { title:'Catálogo de capacidades de protocolo', adminRequired:'Se requiere acceso de administrador.', subtitle:'Visibilidad operativa de solo lectura sobre límites, evidencias y clasificaciones de seguridad de los protocolos registrados.', loading:'Cargando capacidades de protocolo…', unavailable:'Los diagnósticos de capacidades de protocolo no están disponibles', protocols:'Protocolos', mutating:'Con mutación', supervisoryOnly:'Solo supervisión', safetyClassified:'Clasificados por seguridad', operations:'Operaciones', safetyHints:'Indicaciones de seguridad', evidence:'Evidencia', mutatingBoundary:'Puede describir operaciones con mutación', nonMutating:'Protocolo sin mutación', supervisoryBoundary:'Solo límite de supervisión', softwareBoundary:'Límite de software', footer:'Diagnósticos de solo lectura. Controles de ejecución expuestos: no. Controles de mutación expuestos: no.', protocolSummary:'Resumen de protocolos', generated:'Generado', schema:'Esquema', freshSnapshot:'Instantánea reciente', staleSnapshot:'Instantánea obsoleta', invalidSnapshot:'Marca de tiempo no válida' },
  pt: { title:'Catálogo de capacidades de protocolo', adminRequired:'É necessário acesso de administrador.', subtitle:'Visibilidade operacional somente leitura sobre limites, evidências e classificações de segurança dos protocolos registrados.', loading:'Carregando capacidades de protocolo…', unavailable:'Os diagnósticos de capacidades de protocolo estão indisponíveis', protocols:'Protocolos', mutating:'Com mutação', supervisoryOnly:'Somente supervisão', safetyClassified:'Classificados por segurança', operations:'Operações', safetyHints:'Orientações de segurança', evidence:'Evidências', mutatingBoundary:'Pode descrever operações com mutação', nonMutating:'Protocolo sem mutação', supervisoryBoundary:'Somente limite de supervisão', softwareBoundary:'Limite de software', footer:'Diagnósticos somente leitura. Controles de execução expostos: não. Controles de mutação expostos: não.', protocolSummary:'Resumo de protocolos', generated:'Gerado', schema:'Esquema', freshSnapshot:'Instantâneo recente', staleSnapshot:'Instantâneo desatualizado', invalidSnapshot:'Data e hora inválidas' },
  pl: { title:'Katalog możliwości protokołów', adminRequired:'Wymagany jest dostęp administratora.', subtitle:'Widok tylko do odczytu granic, dowodów i klasyfikacji bezpieczeństwa zarejestrowanych protokołów.', loading:'Ładowanie możliwości protokołów…', unavailable:'Diagnostyka możliwości protokołów jest niedostępna', protocols:'Protokoły', mutating:'Modyfikujące', supervisoryOnly:'Tylko nadzorcze', safetyClassified:'Sklasyfikowane bezpieczeństwo', operations:'Operacje', safetyHints:'Wskazówki bezpieczeństwa', evidence:'Dowody', mutatingBoundary:'Może opisywać operacje modyfikujące', nonMutating:'Protokół niemodyfikujący', supervisoryBoundary:'Wyłącznie granica nadzorcza', softwareBoundary:'Granica programowa', footer:'Diagnostyka tylko do odczytu. Udostępnione sterowanie wykonaniem: nie. Udostępnione sterowanie modyfikacją: nie.', protocolSummary:'Podsumowanie protokołów', generated:'Wygenerowano', schema:'Schemat', freshSnapshot:'Aktualna migawka', staleSnapshot:'Nieaktualna migawka', invalidSnapshot:'Nieprawidłowy znacznik czasu' },
  ru: { title:'Каталог возможностей протоколов', adminRequired:'Требуется доступ администратора.', subtitle:'Операторский просмотр только для чтения границ, доказательств и классификаций безопасности зарегистрированных протоколов.', loading:'Загрузка возможностей протоколов…', unavailable:'Диагностика возможностей протоколов недоступна', protocols:'Протоколы', mutating:'Изменяющие', supervisoryOnly:'Только надзор', safetyClassified:'Классифицировано по безопасности', operations:'Операции', safetyHints:'Указания по безопасности', evidence:'Доказательства', mutatingBoundary:'Может описывать изменяющие операции', nonMutating:'Неизменяющий протокол', supervisoryBoundary:'Только надзорная граница', softwareBoundary:'Программная граница', footer:'Диагностика только для чтения. Элементы управления выполнением: нет. Элементы управления изменениями: нет.', protocolSummary:'Сводка протоколов', generated:'Создано', schema:'Схема', freshSnapshot:'Актуальный снимок', staleSnapshot:'Устаревший снимок', invalidSnapshot:'Недопустимая отметка времени' },
  de: { title:'Katalog der Protokollfähigkeiten', adminRequired:'Administratorzugriff erforderlich.', subtitle:'Schreibgeschützte Operator-Sicht auf registrierte Protokollgrenzen, Nachweise und Sicherheitsklassifizierungen.', loading:'Protokollfunktionen werden geladen…', unavailable:'Diagnose der Protokollfunktionen nicht verfügbar', protocols:'Protokolle', mutating:'Verändernd', supervisoryOnly:'Nur Überwachung', safetyClassified:'Sicherheitsklassifiziert', operations:'Betrieb', safetyHints:'Sicherheitshinweise', evidence:'Nachweise', mutatingBoundary:'Kann verändernde Vorgänge beschreiben', nonMutating:'Nicht veränderndes Protokoll', supervisoryBoundary:'Nur Überwachungsgrenze', softwareBoundary:'Softwaregrenze', footer:'Schreibgeschützte Diagnose. Ausführungssteuerungen verfügbar: nein. Änderungssteuerungen verfügbar: nein.', protocolSummary:'Protokollübersicht', generated:'Generiert', schema:'Schema', freshSnapshot:'Aktueller Snapshot', staleSnapshot:'Veralteter Snapshot', invalidSnapshot:'Ungültiger Snapshot-Zeitstempel' },
  fr: { title:'Catalogue des capacités de protocole', adminRequired:'Un accès administrateur est requis.', subtitle:'Visibilité opérateur en lecture seule sur les limites de protocole enregistrées, les preuves et les classifications de sécurité.', loading:'Chargement des capacités du protocole…', unavailable:'Diagnostics des capacités du protocole indisponibles', protocols:'Protocoles', mutating:'Avec mutation', supervisoryOnly:'Supervision uniquement', safetyClassified:'Classés par sécurité', operations:'Opérations', safetyHints:'Indications de sécurité', evidence:'Preuves', mutatingBoundary:'Peut décrire des opérations avec mutation', nonMutating:'Protocole sans mutation', supervisoryBoundary:'Limite de supervision uniquement', softwareBoundary:'Limite logicielle', footer:'Diagnostics en lecture seule. Contrôles d’exécution exposés : non. Contrôles de mutation exposés : non.', protocolSummary:'Résumé des protocoles', generated:'Généré', schema:'Schéma', freshSnapshot:'Instantané récent', staleSnapshot:'Instantané obsolète', invalidSnapshot:'Horodatage d’instantané non valide' },
  it: { title:'Catalogo delle funzionalità di protocollo', adminRequired:'È richiesto l’accesso amministratore.', subtitle:'Visibilità operatore in sola lettura su confini dei protocolli registrati, evidenze e classificazioni di sicurezza.', loading:'Caricamento delle funzionalità del protocollo…', unavailable:'Diagnostica delle funzionalità del protocollo non disponibile', protocols:'Protocolli', mutating:'Con mutazione', supervisoryOnly:'Solo supervisione', safetyClassified:'Classificati per sicurezza', operations:'Operazioni', safetyHints:'Suggerimenti di sicurezza', evidence:'Prove', mutatingBoundary:'Può descrivere operazioni con mutazione', nonMutating:'Protocollo senza mutazione', supervisoryBoundary:'Solo limite di supervisione', softwareBoundary:'Limite software', footer:'Diagnostica in sola lettura. Controlli di esecuzione esposti: no. Controlli di mutazione esposti: no.', protocolSummary:'Riepilogo dei protocolli', generated:'Generato', schema:'Schema', freshSnapshot:'Snapshot recente', staleSnapshot:'Snapshot obsoleto', invalidSnapshot:'Timestamp dello snapshot non valido' },
  ja: { title:'プロトコル機能カタログ', adminRequired:'管理者権限が必要です。', subtitle:'登録済みのプロトコル境界、証跡、安全性分類をオペレーターが読み取り専用で確認できます。', loading:'プロトコル機能を読み込み中…', unavailable:'プロトコル機能の診断を利用できません', protocols:'プロトコル', mutating:'変更あり', supervisoryOnly:'監視専用', safetyClassified:'安全性分類済み', operations:'運用', safetyHints:'安全性のヒント', evidence:'証拠', mutatingBoundary:'変更を伴う操作を記述する場合があります', nonMutating:'変更なしのプロトコル', supervisoryBoundary:'監視境界のみ', softwareBoundary:'ソフトウェア境界', footer:'読み取り専用の診断です。実行コントロールの公開: なし。変更コントロールの公開: なし。', protocolSummary:'プロトコルの概要', generated:'生成済み', schema:'スキーマ', freshSnapshot:'最新のスナップショット', staleSnapshot:'古いスナップショット', invalidSnapshot:'スナップショットのタイムスタンプが無効です' },
  ko: { title:'프로토콜 기능 카탈로그', adminRequired:'관리자 권한이 필요합니다.', subtitle:'등록된 프로토콜 경계, 증거 및 안전 분류에 대한 운영자 읽기 전용 가시성입니다.', loading:'프로토콜 기능을 불러오는 중…', unavailable:'프로토콜 기능 진단을 사용할 수 없음', protocols:'프로토콜', mutating:'변경 작업', supervisoryOnly:'감독 전용', safetyClassified:'안전 분류됨', operations:'운영', safetyHints:'안전 힌트', evidence:'증거', mutatingBoundary:'변경 작업을 설명할 수 있음', nonMutating:'비변경 프로토콜', supervisoryBoundary:'감독 경계 전용', softwareBoundary:'소프트웨어 경계', footer:'읽기 전용 진단입니다. 실행 제어 노출: 아니요. 변경 제어 노출: 아니요.', protocolSummary:'프로토콜 요약', generated:'생성됨', schema:'스키마', freshSnapshot:'최신 스냅샷', staleSnapshot:'오래된 스냅샷', invalidSnapshot:'잘못된 스냅샷 타임스탬프' },
  ar: { title:'كتالوج قدرات البروتوكول', adminRequired:'يلزم الوصول بصلاحيات المسؤول.', subtitle:'رؤية للقراءة فقط للمشغّل على حدود البروتوكولات المسجّلة والأدلة وتصنيفات السلامة.', loading:'جارٍ تحميل قدرات البروتوكول…', unavailable:'تشخيصات قدرات البروتوكول غير متاحة', protocols:'البروتوكولات', mutating:'تعديلية', supervisoryOnly:'للإشراف فقط', safetyClassified:'مصنَّفة أمنيًا', operations:'العمليات', safetyHints:'تلميحات الأمان', evidence:'الأدلة', mutatingBoundary:'قد يصف عمليات تعديلية', nonMutating:'بروتوكول غير تعديلي', supervisoryBoundary:'حد إشرافي فقط', softwareBoundary:'حد البرنامج', footer:'تشخيصات للقراءة فقط. عناصر التحكم في التنفيذ مكشوفة: لا. عناصر التحكم في التعديل مكشوفة: لا.', protocolSummary:'ملخص البروتوكولات', generated:'تم الإنشاء', schema:'المخطط', freshSnapshot:'لقطة حديثة', staleSnapshot:'لقطة قديمة', invalidSnapshot:'الطابع الزمني للقطة غير صالح' },
}

export const labelsForLocale = (locale: string) => dictionaries[locale] || dictionaries.en
export const snapshotFreshness = (generatedAt: string, now = Date.now()) => {
  const generated = Date.parse(generatedAt)
  if (!Number.isFinite(generated)) return 'invalid' as const
  return Math.max(0, now - generated) > STALE_AFTER_MS ? 'stale' as const : 'fresh' as const
}

export default function ProtocolCapabilityCatalogClient({ labels }: { labels: ProtocolCatalogLabels }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/internal/supervisor/protocol-capabilities', { method: 'GET', cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(labels.unavailable); return response.json() as Promise<Snapshot> })
      .then(setSnapshot)
      .catch(reason => { if ((reason as Error).name !== 'AbortError') setError((reason as Error).message) })
    return () => controller.abort()
  }, [labels.unavailable])

  const freshness = snapshot ? snapshotFreshness(snapshot.generatedAt) : null
  const freshnessLabel = freshness === 'fresh' ? labels.freshSnapshot : freshness === 'stale' ? labels.staleSnapshot : labels.invalidSnapshot

  return <main style={page} aria-labelledby="protocol-catalog-title" aria-busy={!snapshot && !error}>
    <header style={{ display:'grid', gap:8 }}><div style={eyebrow}><LocalizedText fallback={uiText('generatedUi.u_a69d967bbb755708')} /></div><h1 id="protocol-catalog-title" style={{ margin:0 }}>{labels.title}</h1><p style={muted}>{labels.subtitle}</p></header>
    {error && <div role="alert" style={errorCard}>{error}</div>}
    {!snapshot && !error && <p role="status" aria-live="polite" style={muted}>{labels.loading}</p>}
    {snapshot && <>
      <aside aria-label={freshnessLabel} style={freshness === 'fresh' ? freshnessCard : warningCard} role="status">
        <strong>{freshnessLabel}</strong><span>{labels.generated}: <time dateTime={snapshot.generatedAt}>{snapshot.generatedAt}</time></span><span>{labels.schema}: {snapshot.schemaVersion}</span>
      </aside>
      <section aria-label={labels.protocolSummary} style={summaryGrid} role="list">
        <Metric label={labels.protocols} value={snapshot.summary.protocols}/><Metric label={labels.mutating} value={snapshot.summary.mutatingProtocols}/><Metric label={labels.supervisoryOnly} value={snapshot.summary.supervisoryOnlyProtocols}/><Metric label={labels.safetyClassified} value={snapshot.summary.safetyClassifiedProtocols}/>
      </section>
      <section style={{ display:'grid', gap:12 }} aria-label={labels.title}>{snapshot.protocols.map(protocol => <article key={protocol.protocolId} style={card} aria-labelledby={`protocol-${protocol.protocolId}`}>
        <div style={cardHeader}><h2 id={`protocol-${protocol.protocolId}`} style={{ margin:0, fontSize:18 }}>{protocol.protocolId.toUpperCase()}</h2><span style={pill}>{protocol.domain} · v{protocol.version}</span></div>
        <Row label={labels.operations} values={protocol.operations}/><Row label={labels.safetyHints} values={protocol.safetyHints}/><Row label={labels.evidence} values={protocol.evidence}/>
        <div style={boundary}>{protocol.mutating ? labels.mutatingBoundary : labels.nonMutating} · {protocol.supervisoryOnly ? labels.supervisoryBoundary : labels.softwareBoundary}</div>
      </article>)}</section>
      <footer style={footer}>{labels.footer}</footer>
    </>}
  </main>
}

function Metric({ label, value }: { label: string; value: number }) { return <div style={metric} role="listitem"><strong style={{ fontSize:24 }}>{value}</strong><span style={muted}>{label}</span></div> }
function Row({ label, values }: { label: string; values: string[] }) { return <div><div style={rowLabel}>{label}</div><div style={{ display:'flex', flexWrap:'wrap', gap:6 }} role="list">{values.map(value => <span key={value} style={tag} role="listitem">{value}</span>)}</div></div> }
const page={minHeight:'100vh',padding:'clamp(16px,4vw,32px)',color:'#fff',background:'linear-gradient(135deg,#06111f,#05070c)',display:'grid',gap:24}
const eyebrow={fontSize:11,fontWeight:800,letterSpacing:'.12em',textTransform:'uppercase' as const,color:'#67e8f9'}
const muted={color:'rgba(255,255,255,.62)',margin:0}; const summaryGrid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12}
const metric={display:'grid',gap:4,padding:16,borderRadius:12,border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.035)'}
const freshnessCard: CSSProperties={display:'flex',flexWrap:'wrap',gap:12,padding:12,borderRadius:10,border:'1px solid rgba(56,242,164,.35)',background:'rgba(6,78,59,.2)',fontSize:12}
const warningCard: CSSProperties={...freshnessCard,border:'1px solid rgba(253,230,138,.45)',background:'rgba(120,53,15,.22)'}
const card={display:'grid',gap:14,padding:18,borderRadius:14,border:'1px solid rgba(255,255,255,.1)',background:'rgba(3,7,18,.56)',minWidth:0}
const cardHeader={display:'flex',justifyContent:'space-between',gap:16,alignItems:'baseline',flexWrap:'wrap' as const}
const pill={fontSize:11,padding:'4px 8px',borderRadius:999,background:'rgba(103,232,249,.12)',color:'#a5f3fc',overflowWrap:'anywhere' as const}
const rowLabel={fontSize:11,fontWeight:800,textTransform:'uppercase' as const,letterSpacing:'.08em',color:'rgba(255,255,255,.55)',marginBottom:7}
const tag={fontSize:11,padding:'4px 7px',borderRadius:7,background:'rgba(255,255,255,.07)',color:'rgba(255,255,255,.8)',overflowWrap:'anywhere' as const}
const boundary={fontSize:12,color:'#fde68a',overflowWrap:'anywhere' as const}; const footer={fontSize:12,color:'rgba(255,255,255,.55)',paddingTop:4}
const errorCard={padding:14,borderRadius:10,border:'1px solid rgba(248,113,113,.4)',color:'#fecaca',background:'rgba(127,29,29,.25)'}
