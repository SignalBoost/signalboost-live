// saas/lib/ai/cos/executionHonesty.ts
// Structural action-integrity checks for COS/model replies.

/** Real tool identifiers exposed by the support route. */
const KNOWN_TOOL_NAME = /\b(getPricing|getBusinessMetrics|getExternalInfo|searchVideos|getAffiliateCount|rememberFact|forgetFact|getOpportunityAlerts|listRepoFiles|readRepoFile|proposeCodeCommit|listAiBranches|findNextUntranslatedComponent|listCleanupBranches|deleteBranches|proposeGrowthPlan|proposeMarketingCampaign|proposePressCampaign|updateGrowthPlanStatus|listGrowthPlans|createOutreachDraft|createMyOutreachDraft|listMyOutreachDrafts|getPressCampaignStatus|cancelPressCampaign|getCompanyFacts|setCompanyFacts|findPublications|startProspectCampaign|getProspectCampaignStatus|searchPastConversations|deleteConversationHistory|proposeInfrastructurePR|listInfrastructurePRs|listProviderActions|runRepoAudit|getAuditFindings)\b/

const EXECUTION_CLAIM = new RegExp([
  'executing (them |these |the [a-z ]{0,20})?(now|immediately)',
  'i am (now )?(executing|starting|running|pulling|fetching|checking)',
  'i[’\']?m (now )?(executing|starting|running|pulling|fetching|checking)',
  'i (have|’ve|\'ve) (now )?(fetched|queried|pulled|scanned|retrieved|checked)',
  'i (called|invoked|ran) [a-zA-Z]+ (and|to)',
  '\\(executing immediately\\)',
  'ejecutando (ahora|inmediatamente)', 'estoy ejecutando',
  'executando (agora|imediatamente)', 'estou executando',
  'wykonuję (teraz|natychmiast)', 'właśnie (wykonuję|uruchamiam)',
  'выполняю (сейчас|немедленно)',
].join('|'), 'i')

const INVOCATION_FRAME = new RegExp([
  'i (will|am going to|am about to) (call|invoke|run|use) [a-zA-Z]',
  'calling [a-zA-Z]+ (on|against|with|for)',
  '(voy a|vou) (llamar|chamar|ejecutar|executar) [a-zA-Z]',
  'wywołam [a-zA-Z]', 'вызову [a-zA-Z]',
].join('|'), 'i')

// Tool-looking identifiers that are NOT in the real tool registry are especially
// dangerous: they make COS claim integrations/capabilities that do not exist.
const TOOL_LIKE_IDENTIFIER = /\b([a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+|(?:get|list|read|run|fetch|search|query|scan|check|pull)[A-Z][A-Za-z0-9]*)\s*\(/g
const TOOL_CAPABILITY_FRAME = /\b(COS tools?|tools? can|I can (?:call|use|run)|I (?:will|am going to|am about to) (?:call|use|run)|execut(?:e|ing)|call(?:ing)?)\b/i

export function detectsInventedToolClaim(reply: string): boolean {
  if (!reply || !TOOL_CAPABILITY_FRAME.test(reply)) return false
  TOOL_LIKE_IDENTIFIER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOOL_LIKE_IDENTIFIER.exec(reply))) {
    const name = match[1]
    if (!KNOWN_TOOL_NAME.test(name)) return true
  }
  return false
}

export function detectsNarratedExecution(reply: string): boolean {
  if (!reply) return false
  if (EXECUTION_CLAIM.test(reply)) return true
  if (detectsInventedToolClaim(reply)) return true
  return KNOWN_TOOL_NAME.test(reply) && INVOCATION_FRAME.test(reply)
}

export const NARRATED_EXECUTION_RETRY_INSTRUCTION =
  'STOP. Your previous message described execution but emitted zero tool_use blocks, or it named a tool/integration that is not in the real tool registry. Do not narrate, invent, or announce tools. Use ONLY a tool present in your supplied tool definitions and CALL the first relevant real tool now. If no supplied tool can perform the action, state that exact limitation without inventing a tool name or claiming execution.'

function honestCorrection(languageCode: string): string {
  const M: Record<string, string> = {
    en: 'No tool executed in this turn. Any execution language above is therefore not evidence of an action, and any tool name not present in the actual tool registry is not an available integration.',
    es: 'No se ejecutó ninguna herramienta en este turno. Por tanto, cualquier lenguaje de ejecución anterior no demuestra una acción, y cualquier herramienta que no esté en el registro real no es una integración disponible.',
    pt: 'Nenhuma ferramenta foi executada neste turno. Portanto, qualquer linguagem de execução acima não comprova uma ação, e qualquer ferramenta que não esteja no registro real não é uma integração disponível.',
    pl: 'W tej turze nie wykonano żadnego narzędzia. Dlatego wcześniejsze deklaracje wykonania nie są dowodem działania, a narzędzie spoza rzeczywistego rejestru nie jest dostępną integracją.',
    ru: 'В этом ходе ни один инструмент не был выполнен. Поэтому заявления о выполнении выше не являются доказательством действия, а инструмент вне реального реестра недоступен.',
  }
  return M[languageCode] || M.en
}

export function guardNarratedExecution(reply: string, toolsFiredCount: number, languageCode: string): string {
  if (!reply || toolsFiredCount > 0) return reply
  if (!detectsNarratedExecution(reply)) return reply
  return `${reply}\n\n${honestCorrection(languageCode)}`
}
