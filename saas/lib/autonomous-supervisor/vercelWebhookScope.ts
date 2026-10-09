export function verifiedPlatformVercelWebhookScope(input: any, projectId: string | undefined): boolean {
  if (!projectId || !/^prj_[A-Za-z0-9]+$/.test(projectId)) return false
  const deployment = input?.payload?.deployment ?? input?.deployment ?? input?.data ?? input?.payload
  const provided = [deployment?.projectId, input?.payload?.project?.id, input?.projectId].filter(Boolean)
  return provided.length > 0 && provided.every((id: unknown) => id === projectId)
}
