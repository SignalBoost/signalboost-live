function builderRoutingContextFromBody(body: any) {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return {
    attachmentNames: attachments.map((item: any) => String(item?.name || '')),
    attachmentMimeTypes: attachments.map((item: any) => String(item?.mimeType || item?.type || '')),
    attachmentSizes: attachments.map((item: any) => Number(item?.size || 0)),
  }
}

function hasImageOrPdfAttachment(body: any): boolean {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return attachments.some((item: any) => /image\/|application\/pdf/i.test(String(item?.mimeType || item?.type || '')))
}

async function directBuilder(body: any, input: string): Promise<NextResponse | null> {
  // Image/PDF attachments still stay on the ordinary COS path. Source-code attachments are
  // Builder evidence and must not block the sandbox route.
  const objective = input.trim()
  if (isPastedOperationalLog(objective)) {
    return NextResponse.json({
      reply: operationalLogReply(objective),
      source: 'concierge-operational-log-analysis',
      execution_allowed: false,
      external_action_taken: false,
    })
  }
  const routingContext = builderRoutingContextFromBody(body)
  const roleMatched = isConciergeBuilderObjective(objective, routingContext)
  // Browser messages may carry whitespace around the typed request. Classify the actual
  // objective, so a valid design request never exposes a Builder control-plane error.
  const designMatched = CONCIERGE_DESIGN_ARTIFACT.test(objective) && CONCIERGE_DESIGN_REQUEST.test(objective)
  if (hasImageOrPdfAttachment(body) || !(roleMatched || designMatched)) return null
  console.info('[concierge-builder-routing]', JSON.stringify({
    route: 'builder',
    roleMatched,
    designMatched,
    hasAttachments: hasAttachments(body),
    attachmentNames: routingContext.attachmentNames,
  }))
