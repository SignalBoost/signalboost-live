export type ConciergeTranscriptTurn = {
  request: string
  response: string
}

export function transcriptMessages(turns: ConciergeTranscriptTurn[], pendingRequest: string) {
  return [
    ...turns.flatMap((turn) => [
      { role: 'user' as const, content: turn.request },
      { role: 'assistant' as const, content: turn.response },
    ]),
    { role: 'user' as const, content: pendingRequest },
  ]
}

export function formatConciergeTranscript(
  turns: ConciergeTranscriptTurn[],
  labels: { request: string; response: string },
): string {
  return turns
    .map((turn, index) => [
      `${labels.request} ${index + 1}`,
      turn.request,
      '',
      `${labels.response} ${index + 1}`,
      turn.response,
    ].join('\n'))
    .join('\n\n────────────────────────────────\n\n')
}
