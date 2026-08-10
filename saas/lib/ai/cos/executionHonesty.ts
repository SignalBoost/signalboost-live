// saas/lib/ai/cos/executionHonesty.ts
//
// NARRATED-EXECUTION GUARD — a reply that claims to be running tools when no tool ran.
//
// THE INCIDENT THIS EXISTS FOR. Asked for an incident-investigation plan, COS answered
// "I am executing the first two steps now", named readRepoFile and getExternalInfo with
// exact arguments, wrote "executing immediately" twice — and emitted ZERO tool_use
// blocks. stop_reason was end_turn. The tool loop in routeCore is real and works; it
// simply had nothing to iterate, because the model wrote ABOUT calling tools instead of
// calling them. Asked afterwards to account for its sources, it admitted it plainly:
// "No tool calls were made... they were described as steps to take."
//
// WHY PROMPTING CANNOT FIX IT. The system prompt's DRIVE-DO-NOT-ASK stance reliably
// produces the LANGUAGE of decisiveness; under that pressure the model performs the
// persona ("I am executing...") instead of the work. An instruction cannot force a
// tool_use block into a turn that has already ended. The check has to be structural:
// compare what the reply CLAIMS against what the turn actually DID — the same fail-
// closed rule the rest of the platform applies to unrecorded permissions and unfired
// owner actions (see guardConfabulatedAction, which catches the completed-action case
// for non-owners; this guard catches the in-progress case for everyone).
//
// WHAT IT DOES. When a turn fired zero tools and the reply either (a) claims execution
// is happening/done, or (b) names a real tool as something being invoked, the guard
// appends a plainly-worded correction in the user's language: nothing ran, this is a
// plan, say the word to execute it. The original text is preserved — the plan itself
// is usually good work — but it can no longer masquerade as results.
//
// WHY APPEND RATHER THAN REWRITE. guardConfabulatedAction replaces the reply because a
// non-owner claiming a completed owner action is false end to end. Here the analysis is
// genuine and only the execution claim is false, and a regex cannot separate the two
// mid-text. Appending keeps every true sentence and corrects the one lie — and a false
// positive costs one clarifying sentence instead of a destroyed answer.

/**
 * Tool names as they appear in this session's tool list. Matched as whole words,
 * case-sensitively — these are camelCase identifiers, and case-insensitive matching
 * would let ordinary prose ("read repo file") trip the guard.
 */
const KNOWN_TOOL_NAME = /\b(getPricing|getBusinessMetrics|getExternalInfo|searchVideos|getAffiliateCount|rememberFact|forgetFact|getOpportunityAlerts|listRepoFiles|readRepoFile|proposeCodeCommit|listAiBranches|findNextUntranslatedComponent|listCleanupBranches|deleteBranches|proposeGrowthPlan|proposeMarketingCampaign|proposePressCampaign|updateGrowthPlanStatus|listGrowthPlans|createOutreachDraft|createMyOutreachDraft|listMyOutreachDrafts|getPressCampaignStatus|cancelPressCampaign|getCompanyFacts|setCompanyFacts|findPublications|startProspectCampaign|getProspectCampaignStatus|searchPastConversations|deleteConversationHistory|proposeInfrastructurePR|listInfrastructurePRs|listProviderActions|runRepoAudit|getAuditFindings)\b/

/**
 * Claims that execution is underway or complete, across the five platform languages.
 * Deliberately narrow: offers ("I can check"), futures without commitment ("I could
 * call"), and instructions to the user ("you should run") must NOT match. What must
 * match is the present-progressive or completed form applied to this turn's own work.
 */
const EXECUTION_CLAIM = new RegExp(
  [
    // English
    'executing (them |these |the [a-z ]{0,20})?(now|immediately)', 'i am (now )?executing', 'i am running (the|these|those)',
    'i (have|\u2019ve|\'ve) (now )?(fetched|queried|pulled|scanned|retrieved|checked) (the|your|live)',
    'i (called|invoked|ran) [a-zA-Z]+ (and|to)', '\\(executing immediately\\)',
    // Spanish
    'ejecutando (ahora|inmediatamente)', 'estoy ejecutando', 'he (consultado|obtenido|escaneado|verificado) (los|las|tu)',
    // Portuguese
    'executando (agora|imediatamente)', 'estou executando', 'eu (consultei|obtive|escaneei|verifiquei) (os|as|seu|sua)',
    // Polish
    'wykonuj\u0119 (teraz|natychmiast)', 'w\u0142a\u015bnie (wykonuj\u0119|uruchamiam)', '(pobra\u0142em|sprawdzi\u0142em|zeskanowa\u0142em) (twoje|dane|logi)',
    // Russian
    '\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u044e (\u0441\u0435\u0439\u0447\u0430\u0441|\u043d\u0435\u043c\u0435\u0434\u043b\u0435\u043d\u043d\u043e)', '\u044f (\u0437\u0430\u043f\u0440\u043e\u0441\u0438\u043b|\u043f\u043e\u043b\u0443\u0447\u0438\u043b|\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u043b) (\u0432\u0430\u0448\u0438|\u0434\u0430\u043d\u043d\u044b\u0435|\u043b\u043e\u0433\u0438)',
  ].join('|'),
  'i',
)

/**
 * A tool name in prose only counts as a narrated invocation when the surrounding text
 * frames it as being called — "I will call readRepoFile", "calling getExternalInfo
 * against". A tool name alone is legitimate (explaining what a tool is for, listing
 * capabilities), so the frame is required.
 */
const INVOCATION_FRAME = new RegExp(
  [
    'i (will|am going to|am about to) (call|invoke|run|use) [a-zA-Z]',
    'calling [a-zA-Z]+ (on|against|with|for)',
    '(voy a|vou) (llamar|chamar|ejecutar|executar) [a-zA-Z]',
    'wywo\u0142am [a-zA-Z]', '\u0432\u044b\u0437\u043e\u0432\u0443 [a-zA-Z]',
  ].join('|'),
  'i',
)

function honestCorrection(languageCode: string): string {
  const M: Record<string, string> = {
    en: 'To be clear: none of the tool calls described above actually ran while writing this reply — no files were read, no live data was fetched, and nothing executed. This is a plan, not results. Say "run it" and I will execute these steps for real.',
    es: 'Para ser claro: ninguna de las llamadas a herramientas descritas arriba se ejecut\u00f3 realmente al escribir esta respuesta — no se leyeron archivos, no se obtuvieron datos en vivo y nada se ejecut\u00f3. Esto es un plan, no resultados. Diga "ejec\u00fatalo" y ejecutar\u00e9 estos pasos de verdad.',
    pt: 'Para ser claro: nenhuma das chamadas de ferramentas descritas acima foi realmente executada ao escrever esta resposta — nenhum arquivo foi lido, nenhum dado ao vivo foi obtido e nada foi executado. Isto \u00e9 um plano, n\u00e3o resultados. Diga "execute" e eu executarei estes passos de verdade.',
    pl: 'Dla jasno\u015bci: \u017cadne z opisanych powy\u017cej wywo\u0142a\u0144 narz\u0119dzi nie zosta\u0142o faktycznie wykonane podczas pisania tej odpowiedzi — nie odczytano plik\u00f3w, nie pobrano danych na \u017cywo i nic nie zosta\u0142o uruchomione. To jest plan, a nie wyniki. Powiedz "wykonaj", a wykonam te kroki naprawd\u0119.',
    ru: '\u0414\u043b\u044f \u044f\u0441\u043d\u043e\u0441\u0442\u0438: \u043d\u0438 \u043e\u0434\u0438\u043d \u0438\u0437 \u043e\u043f\u0438\u0441\u0430\u043d\u043d\u044b\u0445 \u0432\u044b\u0448\u0435 \u0432\u044b\u0437\u043e\u0432\u043e\u0432 \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u043e\u0432 \u043d\u0435 \u0431\u044b\u043b \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d \u043f\u0440\u0438 \u043d\u0430\u043f\u0438\u0441\u0430\u043d\u0438\u0438 \u044d\u0442\u043e\u0433\u043e \u043e\u0442\u0432\u0435\u0442\u0430 — \u0444\u0430\u0439\u043b\u044b \u043d\u0435 \u0447\u0438\u0442\u0430\u043b\u0438\u0441\u044c, \u0434\u0430\u043d\u043d\u044b\u0435 \u043d\u0435 \u0437\u0430\u043f\u0440\u0430\u0448\u0438\u0432\u0430\u043b\u0438\u0441\u044c, \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u044f\u043b\u043e\u0441\u044c. \u042d\u0442\u043e \u043f\u043b\u0430\u043d, \u0430 \u043d\u0435 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b. \u0421\u043a\u0430\u0436\u0438\u0442\u0435 "\u0432\u044b\u043f\u043e\u043b\u043d\u0438", \u0438 \u044f \u0432\u044b\u043f\u043e\u043b\u043d\u044e \u044d\u0442\u0438 \u0448\u0430\u0433\u0438 \u043f\u043e-\u043d\u0430\u0441\u0442\u043e\u044f\u0449\u0435\u043c\u0443.',
  }
  return M[languageCode] || M.en
}

/**
 * Appends an honest correction to `reply` when this turn executed zero tools yet the
 * text claims execution is underway/done, or narrates the invocation of a real tool.
 * Returns `reply` unchanged in every other case — including every turn where at least
 * one tool genuinely fired, because then "executing now" may simply be true.
 *
 * Applies to ALL sessions, owner included: the owner is the one who received the
 * fabricated investigation, and an owner is not better served by fiction.
 */
/**
 * True when `reply` narrates tool execution — claims it is underway/done, or frames a
 * real tool name as being invoked. Exposed on its own so the route can choose the
 * stronger response first: a RETRY with tool_choice forced, so the model has no way to
 * end its turn without actually calling something. The append below is the fallback
 * for when the retry budget is gone.
 */
export function detectsNarratedExecution(reply: string): boolean {
  if (!reply) return false
  if (EXECUTION_CLAIM.test(reply)) return true
  return KNOWN_TOOL_NAME.test(reply) && INVOCATION_FRAME.test(reply)
}

/**
 * The corrective user turn injected before the forced retry. Deliberately blunt and in
 * English regardless of user language — it is machine-to-model, never shown to a person.
 */
export const NARRATED_EXECUTION_RETRY_INSTRUCTION =
  'STOP. Your previous message DESCRIBED tool calls ("I will call...", "executing now") but made none — zero tool_use blocks were emitted, nothing ran, and the user received fiction dressed as an investigation. Do not describe, announce, or plan tool calls. CALL them. Begin executing the first concrete step of your own plan immediately with a real tool invocation. Text without a tool call is not an acceptable next message.'

export function guardNarratedExecution(
  reply: string,
  toolsFiredCount: number,
  languageCode: string,
): string {
  if (!reply || toolsFiredCount > 0) return reply
  if (!detectsNarratedExecution(reply)) return reply
  return `${reply}\n\n${honestCorrection(languageCode)}`
}
