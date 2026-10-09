// saas/lib/ai/cos/executionHonesty.ts
// Structural action-integrity checks for COS/model replies.

/** Real tool identifiers exposed by the support route. */
const KNOWN_TOOL_NAME = /\b(getPricing|getBusinessMetrics|getExternalInfo|searchVideos|getAffiliateCount|rememberFact|forgetFact|getOpportunityAlerts|listRepoFiles|readRepoFile|proposeCodeCommit|listAiBranches|findNextUntranslatedComponent|listCleanupBranches|deleteBranches|proposeGrowthPlan|proposeMarketingCampaign|proposePressCampaign|updateGrowthPlanStatus|listGrowthPlans|createOutreachDraft|createMyOutreachDraft|listMyOutreachDrafts|getPressCampaignStatus|cancelPressCampaign|getCompanyFacts|setCompanyFacts|findPublications|startProspectCampaign|getProspectCampaignStatus|searchPastConversations|deleteConversationHistory|proposeInfrastructurePR|listInfrastructurePRs|listProviderActions|runRepoAudit|getAuditFindings)\b/

const EXECUTION_CLAIM = new RegExp([
  'executing (them |these |the [a-z ]{0,20})?(now|immediately)',
  'i am (now )?(executing|starting|running|pulling|fetching|checking|verifying|testing)',
  'i[’\']?m (now )?(executing|starting|running|pulling|fetching|checking|verifying|testing)',
  'i (?:will|shall) (?:now |immediately )?(?:run|check|verify|test|fetch|pull|query|inspect|execute|start)',
  'i[’\']?ll (?:now |immediately )?(?:run|check|verify|test|fetch|pull|query|inspect|execute|start)',
  'i (have|’ve|\'ve) (now )?(fetched|queried|pulled|scanned|retrieved|checked|verified|tested)',
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
    de: 'In diesem Durchgang wurde kein Tool ausgeführt. Jede obige Ausführungsformulierung ist daher kein Nachweis einer Aktion, und jeder Tool-Name, der nicht in der tatsächlichen Tool-Registry vorhanden ist, ist keine verfügbare Integration.',
    fr: 'Aucun outil n’a été exécuté lors de ce tour. Toute formulation d’exécution ci-dessus ne constitue donc pas la preuve d’une action, et tout nom d’outil absent du registre réel des outils n’est pas une intégration disponible.',
    it: 'In questo turno non è stato eseguito alcuno strumento. Qualsiasi linguaggio di esecuzione riportato sopra non è quindi una prova di un’azione, e qualsiasi nome di strumento non presente nel registro effettivo degli strumenti non è un’integrazione disponibile.',
    ja: 'このターンではツールは実行されていません。したがって、上記の実行を示す表現は操作の証拠ではなく、実際のツールレジストリに存在しないツール名は利用可能な連携ではありません。',
    ko: '이번 턴에서는 도구가 실행되지 않았습니다. 따라서 위의 실행 관련 표현은 작업의 증거가 아니며, 실제 도구 레지스트리에 없는 도구 이름은 사용 가능한 연동이 아닙니다.',
    ar: 'لم تُنفَّذ أي أداة في هذه الجولة. لذلك فإن أي صياغة تنفيذ أعلاه ليست دليلًا على إجراء، وأي اسم أداة غير موجود في سجل الأدوات الفعلي ليس تكاملًا متاحًا.',
  }
  return M[languageCode] || M.en
}

export function guardNarratedExecution(reply: string, toolsFiredCount: number, languageCode: string): string {
  if (!reply || toolsFiredCount > 0) return reply
  if (!detectsNarratedExecution(reply)) return reply
  return `${reply}\n\n${honestCorrection(languageCode)}`
}
