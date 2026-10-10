'use client'

import { useEffect, useState } from 'react'
import type { AgentProgressEvent } from '@/lib/ai/cos/agentProgressClient'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY: Record<Lang, { active: string; elapsed: string; stages: string[]; note: string }> = {
  en: { active: uiText('generatedUi.u_cos_activity_active'), elapsed: uiText('generatedUi.u_cos_activity_elapsed'), stages: [uiText('generatedUi.u_cos_activity_understand'), uiText('generatedUi.u_cos_activity_evidence'), uiText('generatedUi.u_cos_activity_reason'), uiText('generatedUi.u_cos_activity_prepare')], note: uiText('generatedUi.u_cos_activity_note') },
  es: { active: 'Trabajando en tu solicitud', elapsed: 'transcurrido', stages: ['Entendiendo la solicitud', 'Revisando el contexto y la evidencia disponible', 'Analizando la mejor respuesta', 'Preparando el resultado'], note: 'Resumen de actividad en vivo; el razonamiento privado no se muestra.' },
  pt: { active: 'Trabalhando na sua solicitação', elapsed: 'decorrido', stages: ['Entendendo a solicitação', 'Verificando o contexto e as evidências disponíveis', 'Analisando a melhor resposta', 'Preparando o resultado'], note: 'Resumo da atividade ao vivo; o raciocínio privado não é exibido.' },
  pl: { active: 'Pracuję nad Twoją prośbą', elapsed: 'czas', stages: ['Analizuję prośbę', 'Sprawdzam kontekst i dostępne dowody', 'Opracowuję najlepszą odpowiedź', 'Przygotowuję wynik'], note: 'Podsumowanie aktywności na żywo; prywatne rozumowanie nie jest ujawniane.' },
  ru: { active: 'Работаю над запросом', elapsed: 'прошло', stages: ['Изучаю запрос', 'Проверяю контекст и доступные данные', 'Формирую лучший ответ', 'Готовлю результат'], note: 'Сводка активности в реальном времени; внутренние рассуждения не раскрываются.' },
  de: { active: 'Ihre Anfrage wird bearbeitet', elapsed: 'vergangen', stages: ['Anfrage wird analysiert', 'Kontext und verfügbare Belege werden geprüft', 'Die beste Antwort wird ermittelt', 'Ergebnis wird vorbereitet'], note: 'Live-Aktivitätsübersicht – private Denkprozesse werden nicht offengelegt.' },
  fr: { active: 'Traitement de votre demande', elapsed: 'écoulé', stages: ['Compréhension de la demande', 'Vérification du contexte et des éléments disponibles', 'Recherche de la meilleure réponse', 'Préparation du résultat'], note: 'Résumé de l’activité en direct — le raisonnement privé n’est pas exposé.' },
  it: { active: 'Sto elaborando la tua richiesta', elapsed: 'trascorso', stages: ['Comprensione della richiesta', 'Verifica del contesto e delle prove disponibili', 'Elaborazione della risposta migliore', 'Preparazione del risultato'], note: 'Riepilogo dell’attività in tempo reale: il ragionamento privato non viene mostrato.' },
  ja: { active: 'リクエストを処理中', elapsed: '経過', stages: ['リクエストを理解中', 'コンテキストと利用可能な根拠を確認中', '最適な回答を検討中', '結果を準備中'], note: 'ライブアクティビティの概要 — 内部の推論は表示されません。' },
  ko: { active: '요청을 처리하는 중', elapsed: '경과', stages: ['요청을 파악하는 중', '컨텍스트와 사용 가능한 근거를 확인하는 중', '최적의 응답을 추론하는 중', '결과를 준비하는 중'], note: '실시간 활동 요약 — 비공개 추론은 노출되지 않습니다.' },
  ar: { active: 'جارٍ العمل على طلبك', elapsed: 'منقضٍ', stages: ['جارٍ فهم الطلب', 'جارٍ التحقق من السياق والأدلة المتاحة', 'جارٍ التفكير في أفضل استجابة', 'جارٍ إعداد النتيجة'], note: 'ملخص النشاط المباشر — لا يتم كشف الاستدلال الخاص.' },
}

export default function AgentActivity({ lang = 'en', compact = false, activity }: { lang?: string; compact?: boolean; activity?: AgentProgressEvent | null }) {
  const selected = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang
  const copy = COPY[selected]
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const liveSeconds = activity ? Math.max(seconds, Math.floor(activity.elapsedMs / 1000)) : seconds

  return (
    <div
      role="status"
      aria-live="polite"
      className={`overflow-hidden rounded-2xl border border-cyan-300/25 bg-cyan-300/[.07] ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'}`}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300" />
        </span>
        <span className="text-[13px] font-extrabold text-cyan-100">{activity?.message || copy.active}</span>
        <span className="ms-auto font-mono text-[11px] tabular-nums text-white/45">{liveSeconds}s {copy.elapsed}</span>
      </div>
      <div className={`${compact ? 'mt-2' : 'mt-3'} flex items-center gap-2 text-[11.5px] text-white/55`}>
        <span className="font-mono text-cyan-300">#{activity?.sequence || 1}</span>
        <span>{activity ? copy.note : copy.stages[0]}</span>
      </div>
      {!compact ? <div className="mt-2.5 border-t border-white/10 pt-2 text-[10.5px] text-white/35">{copy.note}</div> : null}
    </div>
  )
}
