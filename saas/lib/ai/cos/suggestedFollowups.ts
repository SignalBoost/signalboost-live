export type FollowupSource = { title?: unknown }

export type SuggestedFollowupsArgs = {
  prompt: string
  reply: string
  sources?: FollowupSource[]
  failedClosed?: boolean
  originPrompt?: string
}

/**
 * Suggested follow-up cascades were retired by the owner on 2026-08-31.
 *
 * Keep this compatibility seam temporarily so existing callers compile while every response
 * receives an empty list. No model call, retrieval, persistence, or chip generation occurs.
 */
export async function suggestFollowups(_args: SuggestedFollowupsArgs): Promise<string[]> {
  return []
}
