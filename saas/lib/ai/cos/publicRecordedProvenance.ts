// Public-safe provenance rendering for the Concierge channel.
//
// A provenance question is about what the server actually recorded for the preceding turn.
// The full record may contain private implementation identifiers (model/provider names, routes,
// utilities and tool ids). Keep those fields available to internal audit code, but never echo them
// through the public renderer. Public provenance reports only high-level origin categories plus
// recorded public source URLs. If the record is unavailable, fail closed instead of inventing it.

export type PublicRecordedSource = { title: string; url: string }

export type PublicRecordedProvenance = {
  recordAvailable: boolean
  fromCache: boolean
  liveEvidenceUsed: boolean
  sources: PublicRecordedSource[]
  responseSource: string | null
  lineageCompleteness: string | null
  localReasoning: { invoked: boolean; model: string | null }
  externalAi: { invoked: boolean; provider: string | null; model: string | null }
  deterministicUtility: { used: boolean; utility: string | null }
  learnedCorpus: { used: boolean; cited: number; injected: number }
  toolsUsed: string[]
}

const MAX_PUBLIC_SOURCES = 12

function validHttpUrl(value: unknown): string | null {
  const url = String(value ?? '').trim()
  return /^https?:\/\/\S+$/i.test(url) ? url : null
}

function cleanTitle(value: unknown, fallback: string): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  return text.length > 160 ? `${text.slice(0, 159)}…` : text
}

function cleanText(value: unknown, max = 160): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

function recordedToolNames(provenance: any): string[] {
  const values = Array.isArray(provenance?.tools_used)
    ? provenance.tools_used
    : Array.isArray(provenance?.toolsUsed) ? provenance.toolsUsed : []
  const names = new Set<string>()
  for (const item of values) {
    const name = cleanText(typeof item === 'string' ? item : item?.name ?? item?.tool ?? item?.function?.name, 120)
    if (name) names.add(name)
    if (names.size >= 16) break
  }
  return [...names]
}

export function extractPublicRecordedProvenance(provenance: any): PublicRecordedProvenance {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    return {
      recordAvailable: false,
      fromCache: false,
      liveEvidenceUsed: false,
      sources: [],
      responseSource: null,
      lineageCompleteness: null,
      localReasoning: { invoked: false, model: null },
      externalAi: { invoked: false, provider: null, model: null },
      deterministicUtility: { used: false, utility: null },
      learnedCorpus: { used: false, cited: 0, injected: 0 },
      toolsUsed: [],
    }
  }

  const rawSources: any[] = []
  for (const candidate of [
    provenance?.live_external_evidence?.sources,
    provenance?.liveExternalEvidence?.sources,
    provenance?.fresh_evidence?.sources,
    provenance?.freshEvidence?.sources,
    provenance?.live_evidence_sources,
    provenance?.liveEvidenceSources,
    provenance?.answer_origin?.live_evidence_sources,
    provenance?.answerOrigin?.liveEvidenceSources,
    provenance?.live_evidence?.sources,
  ]) {
    if (Array.isArray(candidate)) rawSources.push(...candidate)
  }

  const seen = new Set<string>()
  const sources: PublicRecordedSource[] = []
  for (const source of rawSources) {
    const url = validHttpUrl(source?.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    sources.push({ title: cleanTitle(source?.title, url), url })
    if (sources.length >= MAX_PUBLIC_SOURCES) break
  }

  const liveEvidenceUsed = Boolean(
    provenance?.live_external_evidence?.used
      || provenance?.liveExternalEvidence?.used
      || provenance?.fresh_evidence?.used
      || provenance?.freshEvidence?.used
      || provenance?.live_evidence?.used
      || provenance?.autonomous_research?.used
      || provenance?.autonomous_research_attempted
      || provenance?.autonomousResearchAttempted
      || sources.length,
  )

  const localInvoked = Boolean(provenance?.local_reasoning?.invoked || provenance?.localModelInvoked)
  const externalInvoked = Boolean(provenance?.external_ai?.invoked || provenance?.externalAiInvoked)
  const learned = provenance?.learned_corpus ?? provenance?.learnedCorpus ?? {}
  const learnedFunnel = provenance?.evidence_funnel?.learned_corpus ?? provenance?.evidenceFunnel?.learnedCorpus ?? {}
  const learnedCited = Math.max(0, Number(learned?.evidence_count ?? learned?.cited ?? provenance?.learnedItemsCited ?? learnedFunnel?.cited ?? 0) || 0)
  const learnedInjected = Math.max(0, Number(learned?.injected_count ?? learned?.injected ?? learnedFunnel?.injected ?? provenance?.learnedItemsUsed ?? 0) || 0)

  return {
    recordAvailable: true,
    fromCache: Boolean(
      provenance?.answer_origin?.from_cache
        || provenance?.answerOrigin?.fromCache
        || provenance?.semantic_cache?.used
        || provenance?.cache?.used,
    ),
    liveEvidenceUsed,
    sources,
    responseSource: cleanText(provenance?.response_source ?? provenance?.responseSource ?? provenance?.answer_origin?.response_source, 180),
    lineageCompleteness: cleanText(provenance?.lineage_completeness ?? provenance?.lineageCompleteness, 100),
    localReasoning: {
      invoked: localInvoked,
      model: cleanText(provenance?.local_reasoning?.model ?? provenance?.reasonerLabel, 140),
    },
    externalAi: {
      invoked: externalInvoked,
      provider: cleanText(provenance?.external_ai?.provider ?? provenance?.externalAiProvider, 100),
      model: cleanText(provenance?.external_ai?.model ?? provenance?.externalAiModel, 140),
    },
    deterministicUtility: {
      used: Boolean(provenance?.deterministic_utility?.used || provenance?.deterministicFreshFactUsed),
      utility: cleanText(provenance?.deterministic_utility?.utility, 160),
    },
    learnedCorpus: { used: learnedCited > 0 || Boolean(learned?.used), cited: learnedCited, injected: learnedInjected },
    toolsUsed: recordedToolNames(provenance),
  }
}

function sourceLines(sources: PublicRecordedSource[]): string {
  return sources.map(source => `- ${source.title}: ${source.url}`).join('\n')
}

// Public disclosure deliberately omits the recorded model/provider, route, utility and tool names.
// Those identifiers remain in the internal record for owner/admin audit and troubleshooting.
function publicOriginLine(facts: PublicRecordedProvenance, lang: string): string {
  if (facts.learnedCorpus.used) {
    if (lang === 'pt') return `Origem registrada: o COS usou conhecimento aprendido retido (${facts.learnedCorpus.cited} evidência(s) citada(s)) e o raciocinador sintetizou a resposta.`
    if (lang === 'es') return `Origen registrado: COS usó conocimiento aprendido retenido (${facts.learnedCorpus.cited} evidencia(s) citada(s)) y el razonador sintetizó la respuesta.`
    if (lang === 'pl') return `Zarejestrowane pochodzenie: COS użył zachowanej wiedzy wyuczonej (${facts.learnedCorpus.cited} cytowanych dowodów), a model rozumujący zsyntetyzował odpowiedź.`
    if (lang === 'ru') return `Зафиксированное происхождение: COS использовал сохранённые изученные знания (${facts.learnedCorpus.cited} цитированных свидетельств), а модель рассуждения синтезировала ответ.`
    if (lang === 'de') return `Erfasste Herkunft: COS nutzte gespeichertes erlerntes Wissen (${facts.learnedCorpus.cited} zitierte(r) Beleg(e)), und das Reasoning-Modell hat die Antwort synthetisiert.`
    if (lang === 'fr') return `Origine enregistrée : COS a utilisé des connaissances apprises conservées (${facts.learnedCorpus.cited} élément(s) de preuve cité(s)) et le modèle de raisonnement a synthétisé la réponse.`
    if (lang === 'it') return `Origine registrata: COS ha usato conoscenze apprese conservate (${facts.learnedCorpus.cited} prova/e citata/e) e il modello di ragionamento ha sintetizzato la risposta.`
    if (lang === 'ja') return `記録された出所：COS は保持している学習済み知識（引用された根拠 ${facts.learnedCorpus.cited} 件）を使用し、推論モデルが回答を統合しました。`
    if (lang === 'ko') return `기록된 출처: COS가 보존된 학습 지식(인용된 근거 ${facts.learnedCorpus.cited}건)을 사용했고, 추론 모델이 답변을 종합했습니다.`
    if (lang === 'ar') return `المصدر المسجّل: استخدم COS معرفة مكتسبة محفوظة (${facts.learnedCorpus.cited} من عناصر الأدلة المستشهد بها)، وقام نموذج الاستدلال بتركيب الإجابة.`
    return `Recorded origin: COS used retained learned knowledge (${facts.learnedCorpus.cited} cited evidence item${facts.learnedCorpus.cited === 1 ? '' : 's'}) and the reasoner synthesized the answer.`
  }
  if (facts.externalAi.invoked) {
    if (lang === 'pt') return 'Origem registrada: um provedor externo de IA participou desta resposta.'
    if (lang === 'es') return 'Origen registrado: un proveedor externo de IA participó en esta respuesta.'
    if (lang === 'pl') return 'Zarejestrowane pochodzenie: zewnętrzny dostawca AI uczestniczył w tej odpowiedzi.'
    if (lang === 'ru') return 'Зафиксированное происхождение: внешний провайдер ИИ участвовал в формировании ответа.'
    if (lang === 'de') return 'Erfasste Herkunft: Ein externer KI-Anbieter hat zu dieser Antwort beigetragen.'
    if (lang === 'fr') return 'Origine enregistrée : un fournisseur d’IA externe a contribué à cette réponse.'
    if (lang === 'it') return 'Origine registrata: un fornitore di IA esterno ha contribuito a questa risposta.'
    if (lang === 'ja') return '記録された出所：外部の AI プロバイダーがこの回答に関与しました。'
    if (lang === 'ko') return '기록된 출처: 외부 AI 제공업체가 이 답변에 참여했습니다.'
    if (lang === 'ar') return 'المصدر المسجّل: ساهم مزوّد ذكاء اصطناعي خارجي في هذه الإجابة.'
    return 'Recorded origin: an external AI provider contributed to this answer.'
  }

  if (facts.localReasoning.invoked) {
    if (lang === 'pt') return 'Origem registrada: o raciocinador local gerou ou sintetizou esta resposta.'
    if (lang === 'es') return 'Origen registrado: el razonador local generó o sintetizó esta respuesta.'
    if (lang === 'pl') return 'Zarejestrowane pochodzenie: lokalny model rozumujący wygenerował lub zsyntetyzował tę odpowiedź.'
    if (lang === 'ru') return 'Зафиксированное происхождение: локальная модель рассуждения сгенерировала или синтезировала ответ.'
    if (lang === 'de') return 'Erfasste Herkunft: Das lokale Reasoning-Modell hat diese Antwort erzeugt oder synthetisiert.'
    if (lang === 'fr') return 'Origine enregistrée : le modèle de raisonnement local a généré ou synthétisé cette réponse.'
    if (lang === 'it') return 'Origine registrata: il modello di ragionamento locale ha generato o sintetizzato questa risposta.'
    if (lang === 'ja') return '記録された出所：ローカル推論モデルがこの回答を生成または統合しました。'
    if (lang === 'ko') return '기록된 출처: 로컬 추론 모델이 이 답변을 생성하거나 종합했습니다.'
    if (lang === 'ar') return 'المصدر المسجّل: قام نموذج الاستدلال المحلي بتوليد هذه الإجابة أو تركيبها.'
    return 'Recorded origin: the local reasoner generated or synthesized this answer.'
  }

  if (facts.deterministicUtility.used) {
    if (lang === 'pt') return 'Origem registrada: lógica determinística do servidor produziu esta resposta; nenhum modelo de raciocínio foi registrado como invocado.'
    if (lang === 'es') return 'Origen registrado: lógica determinista del servidor produjo esta respuesta; no se registró ningún modelo de razonamiento como invocado.'
    if (lang === 'pl') return 'Zarejestrowane pochodzenie: deterministyczna logika serwera utworzyła tę odpowiedź; nie odnotowano wywołania modelu rozumującego.'
    if (lang === 'ru') return 'Зафиксированное происхождение: детерминированная серверная логика сформировала ответ; вызов модели рассуждения не зафиксирован.'
    if (lang === 'de') return 'Erfasste Herkunft: Deterministische Serverlogik hat diese Antwort erzeugt; es wurde kein Aufruf eines Reasoning-Modells erfasst.'
    if (lang === 'fr') return 'Origine enregistrée : une logique serveur déterministe a produit cette réponse ; aucun appel à un modèle de raisonnement n’a été enregistré.'
    if (lang === 'it') return 'Origine registrata: una logica server deterministica ha prodotto questa risposta; non è stata registrata alcuna invocazione di un modello di ragionamento.'
    if (lang === 'ja') return '記録された出所：サーバーの決定論的ロジックがこの回答を生成しました。推論モデルの呼び出しは記録されていません。'
    if (lang === 'ko') return '기록된 출처: 서버의 결정론적 로직이 이 답변을 생성했습니다. 추론 모델 호출은 기록되지 않았습니다.'
    if (lang === 'ar') return 'المصدر المسجّل: أنتج منطق الخادم الحتمي هذه الإجابة؛ ولم يُسجَّل استدعاء أي نموذج استدلال.'
    return 'Recorded origin: deterministic server logic produced this answer; no reasoning model was recorded as invoked.'
  }

  if (lang === 'pt') return 'Origem registrada: a resposta foi entregue pelo servidor; o registro público não identifica um modelo de raciocínio como responsável.'
  if (lang === 'es') return 'Origen registrado: la respuesta fue entregada por el servidor; el registro público no identifica un modelo de razonamiento como responsable.'
  if (lang === 'pl') return 'Zarejestrowane pochodzenie: odpowiedź dostarczył serwer; publiczny zapis nie wskazuje modelu rozumującego jako źródła.'
  if (lang === 'ru') return 'Зафиксированное происхождение: ответ был доставлен сервером; публичная запись не указывает модель рассуждения как источник.'
  if (lang === 'de') return 'Erfasste Herkunft: Die Antwort wurde vom Server geliefert; der öffentliche Eintrag nennt kein Reasoning-Modell als Quelle.'
  if (lang === 'fr') return 'Origine enregistrée : la réponse a été fournie par le serveur ; le registre public n’identifie aucun modèle de raisonnement comme source.'
  if (lang === 'it') return 'Origine registrata: la risposta è stata fornita dal server; il registro pubblico non identifica alcun modello di ragionamento come fonte.'
  if (lang === 'ja') return '記録された出所：回答はサーバーから提供されました。公開記録では推論モデルは出所として特定されていません。'
  if (lang === 'ko') return '기록된 출처: 답변은 서버에서 제공되었습니다. 공개 기록에는 추론 모델이 출처로 표시되어 있지 않습니다.'
  if (lang === 'ar') return 'المصدر المسجّل: قدّم الخادم الإجابة؛ ولا يحدد السجل العام أي نموذج استدلال كمصدر لها.'
  return 'Recorded origin: the answer was delivered by the server; the public record does not identify a reasoning model as its source.'
}

function noLiveVerificationLine(facts: PublicRecordedProvenance, lang: string): string {
  if (facts.localReasoning.invoked) {
    if (lang === 'pt') return 'Nenhuma pesquisa web ao vivo nem URL de fonte externa foi registrada para essa resposta. Portanto, qualquer afirmação factual atual ou mutável nela não foi verificada ao vivo e não deve ser tratada como sustentada por fontes web.'
    if (lang === 'es') return 'No se registró ninguna búsqueda web en vivo ni URL de fuente externa para esa respuesta. Por lo tanto, cualquier afirmación factual actual o cambiante no fue verificada en vivo y no debe tratarse como respaldada por fuentes web.'
    if (lang === 'pl') return 'Dla tej odpowiedzi nie zarejestrowano wyszukiwania na żywo ani adresów URL zewnętrznych źródeł. Dlatego wszelkie aktualne lub zmienne twierdzenia faktyczne nie zostały zweryfikowane na żywo i nie powinny być traktowane jako poparte źródłami internetowymi.'
    if (lang === 'ru') return 'Для этого ответа не зафиксированы веб-поиск в реальном времени или URL внешних источников. Поэтому любые актуальные или изменяемые фактические утверждения не были проверены в реальном времени и не должны считаться подтверждёнными веб-источниками.'
    if (lang === 'de') return 'Für diese Antwort wurden weder eine Live-Websuche noch URLs externer Quellen erfasst. Aktuelle oder veränderliche Tatsachenbehauptungen darin wurden daher nicht live überprüft und sollten nicht als durch Webquellen belegt gelten.'
    if (lang === 'fr') return 'Aucune recherche web en direct ni URL de source externe n’a été enregistrée pour cette réponse. Par conséquent, les affirmations factuelles actuelles ou susceptibles de changer qu’elle contient n’ont pas été vérifiées en direct et ne doivent pas être considérées comme étayées par des sources web.'
    if (lang === 'it') return 'Per questa risposta non sono stati registrati ricerche web in tempo reale né URL di fonti esterne. Pertanto, eventuali affermazioni fattuali attuali o mutevoli non sono state verificate in tempo reale e non vanno considerate supportate da fonti web.'
    if (lang === 'ja') return 'この回答では、リアルタイムのウェブ検索や外部情報源の URL は記録されていません。したがって、回答に含まれる最新の、または変化しうる事実の主張はリアルタイムで検証されておらず、ウェブ情報源に裏付けられたものとして扱うべきではありません。'
    if (lang === 'ko') return '이 답변에는 실시간 웹 검색이나 외부 출처 URL이 기록되지 않았습니다. 따라서 답변에 포함된 최신 또는 변경될 수 있는 사실 주장은 실시간으로 검증되지 않았으며 웹 출처로 뒷받침된 것으로 간주해서는 안 됩니다.'
    if (lang === 'ar') return 'لم يُسجَّل أي بحث مباشر على الويب أو رابط لمصدر خارجي لهذه الإجابة. لذلك فإن أي ادعاءات واقعية حالية أو قابلة للتغير فيها لم يتم التحقق منها مباشرة، ولا ينبغي اعتبارها مدعومة بمصادر من الويب.'
    return 'No live web search or external source URL was recorded for this answer. Therefore, any current or changeable factual claims in it were not live-verified and should not be treated as supported by web sources.'
  }

  if (lang === 'pt') return 'Não foram registradas fontes externas ao vivo para esta resposta.'
  if (lang === 'es') return 'No se registraron fuentes externas en vivo para esta respuesta.'
  if (lang === 'pl') return 'Dla tej odpowiedzi nie zarejestrowano zewnętrznych źródeł na żywo.'
  if (lang === 'ru') return 'Для этого ответа внешние источники в реальном времени не зафиксированы.'
  if (lang === 'de') return 'Für diese Antwort wurden keine externen Live-Quellen erfasst.'
  if (lang === 'fr') return 'Aucune source externe en direct n’a été enregistrée pour cette réponse.'
  if (lang === 'it') return 'Per questa risposta non sono state registrate fonti esterne in tempo reale.'
  if (lang === 'ja') return 'この回答では、リアルタイムの外部情報源は記録されていません。'
  if (lang === 'ko') return '이 답변에는 실시간 외부 출처가 기록되지 않았습니다.'
  if (lang === 'ar') return 'لم تُسجَّل أي مصادر خارجية مباشرة لهذه الإجابة.'
  return 'No live external sources were recorded for this answer.'
}

export function renderPublicRecordedProvenance(provenance: any, language = 'en'): string {
  const facts = extractPublicRecordedProvenance(provenance)
  const lang = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(language) ? language : 'en'

  if (!facts.recordAvailable) {
    if (lang === 'es') return 'No tengo un registro verificable de procedencia para esa respuesta, así que no voy a reconstruirlo ni adivinarlo.'
    if (lang === 'pt') return 'Não tenho um registro verificável de proveniência para essa resposta, então não vou reconstruí-lo nem adivinhá-lo.'
    if (lang === 'pl') return 'Nie mam zweryfikowanego zapisu pochodzenia tej odpowiedzi, więc nie będę go odtwarzać ani zgadywać.'
    if (lang === 'ru') return 'У меня нет проверяемой записи происхождения этого ответа, поэтому я не буду восстанавливать или угадывать её.'
    if (lang === 'de') return 'Ich habe keinen überprüfbaren Herkunftsnachweis für diese Antwort und werde daher nicht rekonstruieren oder raten, woher sie stammt.'
    if (lang === 'fr') return 'Je n’ai pas de registre de provenance vérifiable pour cette réponse ; je ne vais donc pas reconstituer ni deviner son origine.'
    if (lang === 'it') return 'Non ho un registro di provenienza verificabile per quella risposta, quindi non ricostruirò né indovinerò da dove provenga.'
    if (lang === 'ja') return 'その回答について検証可能な出所記録がないため、出所を再構成したり推測したりすることはしません。'
    if (lang === 'ko') return '해당 답변에 대한 검증 가능한 출처 기록이 없으므로, 출처를 재구성하거나 추측하지 않겠습니다.'
    if (lang === 'ar') return 'ليس لدي سجل مصدر قابل للتحقق لتلك الإجابة، لذا لن أعيد بناء مصدرها أو أخمّنه.'
    return "I don't have a verifiable provenance record for that answer, so I won't reconstruct or guess where it came from."
  }

  const origin = publicOriginLine(facts, lang)

  if (facts.sources.length) {
    const lines = sourceLines(facts.sources)
    if (lang === 'es') return `${origin}\n\n${facts.fromCache ? 'El registro indica que esa respuesta fue reutilizada de una respuesta anterior y conserva evidencia pública registrada.' : 'El registro de esa respuesta muestra que se utilizó evidencia pública consultada en vivo.'}\n\nFuentes registradas:\n${lines}\n\nEsta lista proviene del registro real de la respuesta; no fue reconstruida de memoria.`
    if (lang === 'pt') return `${origin}\n\n${facts.fromCache ? 'O registro indica que essa resposta foi reutilizada de uma resposta anterior e preserva evidência pública registrada.' : 'O registro dessa resposta mostra que foram usadas evidências públicas consultadas ao vivo.'}\n\nFontes registradas:\n${lines}\n\nEsta lista vem do registro real da resposta; não foi reconstruída de memória.`
    if (lang === 'pl') return `${origin}\n\n${facts.fromCache ? 'Zapis wskazuje, że ta odpowiedź została ponownie użyta z wcześniejszej odpowiedzi i zachowuje zarejestrowane publiczne dowody.' : 'Zapis tej odpowiedzi pokazuje, że użyto publicznych źródeł sprawdzonych na żywo.'}\n\nZarejestrowane źródła:\n${lines}\n\nTa lista pochodzi z rzeczywistego zapisu odpowiedzi; nie została odtworzona z pamięci.`
    if (lang === 'ru') return `${origin}\n\n${facts.fromCache ? 'Запись показывает, что этот ответ был повторно использован из более раннего ответа и сохраняет зарегистрированные публичные источники.' : 'Запись этого ответа показывает, что использовались публичные источники, проверенные в реальном времени.'}\n\nЗарегистрированные источники:\n${lines}\n\nЭтот список взят из фактической записи ответа, а не восстановлен по памяти.`
    if (lang === 'de') return `${origin}\n\n${facts.fromCache ? 'Der Eintrag zeigt, dass diese Antwort aus einer früheren Antwort wiederverwendet wurde und erfasste öffentliche Belege beibehält.' : 'Der erfasste Gesprächsschritt zeigt, dass für diese Antwort live abgerufene öffentliche Belege verwendet wurden.'}\n\nErfasste Quellen:\n${lines}\n\nDiese Quellenliste stammt aus dem tatsächlichen Eintrag des Gesprächsschritts; sie wurde nicht aus dem Modellgedächtnis rekonstruiert.`
    if (lang === 'fr') return `${origin}\n\n${facts.fromCache ? 'Le registre indique que cette réponse a été réutilisée à partir d’une réponse antérieure et conserve des preuves publiques enregistrées.' : 'Le registre de cette réponse montre que des preuves publiques consultées en direct ont été utilisées.'}\n\nSources enregistrées :\n${lines}\n\nCette liste provient du registre réel de la réponse ; elle n’a pas été reconstituée de mémoire.`
    if (lang === 'it') return `${origin}\n\n${facts.fromCache ? 'Il registro indica che questa risposta è stata riutilizzata da una risposta precedente e conserva prove pubbliche registrate.' : 'Il registro di questa risposta mostra che sono state usate prove pubbliche consultate in tempo reale.'}\n\nFonti registrate:\n${lines}\n\nQuesto elenco proviene dal registro effettivo della risposta; non è stato ricostruito a memoria.`
    if (lang === 'ja') return `${origin}\n\n${facts.fromCache ? '記録によると、この回答は以前の回答から再利用されたもので、記録済みの公開根拠を保持しています。' : 'この回答の記録によると、リアルタイムで参照した公開根拠が使用されました。'}\n\n記録された情報源：\n${lines}\n\nこの一覧は回答の実際の記録に基づくもので、記憶から再構成したものではありません。`
    if (lang === 'ko') return `${origin}\n\n${facts.fromCache ? '기록에 따르면 이 답변은 이전 답변에서 재사용되었으며 기록된 공개 근거를 유지하고 있습니다.' : '이 답변의 기록에 따르면 실시간으로 확인한 공개 근거가 사용되었습니다.'}\n\n기록된 출처:\n${lines}\n\n이 목록은 답변의 실제 기록에서 가져온 것이며, 기억을 바탕으로 재구성한 것이 아닙니다.`
    if (lang === 'ar') return `${origin}\n\n${facts.fromCache ? 'يُظهر السجل أن هذه الإجابة أُعيد استخدامها من إجابة سابقة وتحتفظ بأدلة عامة مسجّلة.' : 'يُظهر سجل هذه الإجابة أنه تم استخدام أدلة عامة جرى الاطلاع عليها مباشرة.'}\n\nالمصادر المسجّلة:\n${lines}\n\nهذه القائمة مأخوذة من السجل الفعلي للإجابة؛ ولم تُعَد صياغتها من الذاكرة.`
    return `${origin}\n\n${facts.fromCache ? 'The record shows that this answer was reused from an earlier response and retains recorded public evidence.' : 'The recorded turn shows that live public evidence was used for this answer.'}\n\nRecorded sources:\n${lines}\n\nThis source list comes from the actual turn record; it was not reconstructed from model memory.`
  }

  if (facts.liveEvidenceUsed) {
    if (lang === 'es') return `${origin}\n\nEl registro muestra que se utilizó evidencia pública en vivo, pero no contiene URL de fuentes que pueda citar. No voy a inventarlas.`
    if (lang === 'pt') return `${origin}\n\nO registro mostra que foi usada evidência pública ao vivo, mas não contém URLs de fontes que eu possa citar. Não vou inventá-las.`
    if (lang === 'pl') return `${origin}\n\nZapis pokazuje, że użyto publicznych dowodów na żywo, ale nie zawiera adresów URL źródeł, które mógłbym podać. Nie będę ich wymyślać.`
    if (lang === 'ru') return `${origin}\n\nЗапись показывает, что использовались актуальные публичные источники, но в ней нет URL, которые я мог бы привести. Я не буду их выдумывать.`
    if (lang === 'de') return `${origin}\n\nDer Eintrag zeigt, dass live abgerufene öffentliche Belege verwendet wurden, enthält aber keine Quell-URLs, die ich zitieren könnte. Ich werde keine erfinden.`
    if (lang === 'fr') return `${origin}\n\nLe registre montre que des preuves publiques en direct ont été utilisées, mais il ne contient aucune URL de source que je puisse citer. Je ne vais pas les inventer.`
    if (lang === 'it') return `${origin}\n\nIl registro mostra che sono state usate prove pubbliche in tempo reale, ma non contiene URL di fonti che io possa citare. Non le inventerò.`
    if (lang === 'ja') return `${origin}\n\n記録によるとリアルタイムの公開根拠が使用されましたが、引用できる情報源の URL は含まれていません。URL を捏造することはしません。`
    if (lang === 'ko') return `${origin}\n\n기록에 따르면 실시간 공개 근거가 사용되었지만, 인용할 수 있는 출처 URL은 포함되어 있지 않습니다. URL을 지어내지 않겠습니다.`
    if (lang === 'ar') return `${origin}\n\nيُظهر السجل أنه تم استخدام أدلة عامة مباشرة، لكنه لا يحتوي على روابط مصادر يمكنني الاستشهاد بها. لن أختلقها.`
    return `${origin}\n\nThe recorded turn shows that live public evidence was used, but it does not contain source URLs I can cite. I won't invent them.`
  }

  if (facts.fromCache) {
    if (lang === 'es') return `${origin}\n\nEl registro muestra que la respuesta fue reutilizada de una respuesta anterior y no registra nuevas fuentes públicas externas para este turno.`
    if (lang === 'pt') return `${origin}\n\nO registro mostra que a resposta foi reutilizada de uma resposta anterior e não registra novas fontes públicas externas para este turno.`
    if (lang === 'pl') return `${origin}\n\nZapis pokazuje, że odpowiedź została ponownie użyta z wcześniejszej odpowiedzi i dla tego przebiegu nie zarejestrowano nowych zewnętrznych źródeł publicznych.`
    if (lang === 'ru') return `${origin}\n\nЗапись показывает, что ответ был повторно использован из более раннего ответа; для этого хода новые внешние публичные источники не зафиксированы.`
    if (lang === 'de') return `${origin}\n\nDer Eintrag zeigt, dass die Antwort aus einer früheren Antwort wiederverwendet wurde; für diesen Gesprächsschritt wurden keine neuen externen öffentlichen Quellen erfasst.`
    if (lang === 'fr') return `${origin}\n\nLe registre montre que la réponse a été réutilisée à partir d’une réponse antérieure ; aucune nouvelle source publique externe n’a été enregistrée pour ce tour.`
    if (lang === 'it') return `${origin}\n\nIl registro mostra che la risposta è stata riutilizzata da una risposta precedente; per questo turno non sono state registrate nuove fonti pubbliche esterne.`
    if (lang === 'ja') return `${origin}\n\n記録によると、この回答は以前の回答から再利用されたもので、このターンでは新たな外部の公開情報源は記録されていません。`
    if (lang === 'ko') return `${origin}\n\n기록에 따르면 이 답변은 이전 답변에서 재사용되었으며, 이번 차례에는 새로운 외부 공개 출처가 기록되지 않았습니다.`
    if (lang === 'ar') return `${origin}\n\nيُظهر السجل أن الإجابة أُعيد استخدامها من إجابة سابقة؛ ولم تُسجَّل مصادر عامة خارجية جديدة لهذا الدور.`
    return `${origin}\n\nThe recorded turn shows that the answer was reused from an earlier response; no new external public sources were recorded for this turn.`
  }

  return `${origin}\n\n${noLiveVerificationLine(facts, lang)}`
}
