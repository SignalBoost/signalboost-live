/** Reconcile only server-persisted repair identities; never merge or infer Production health. */
export type PendingRepositoryRepair = Readonly<{
  pullRequestNumber: number
  baseBranch: string
  repairCommitSha: string
  preMergeSnapshotId: string | null
}>

export async function reconcileMergedRepositoryRepairs(input: {
  pending: readonly PendingRepositoryRepair[]
  token: string
  request?: typeof fetch
  deadlineAtMs?: number
  complete: (evidence: {
    pullRequestNumber: number; mergeCommitSha: string; baseBranch: string
    preMergeSnapshotId: string | null; mergeEvidence: 'observed_github'
  }) => Promise<boolean>
}): Promise<{ inspected: number; completed: number; errors: number }> {
  const counts = { inspected: 0, completed: 0, errors: 0 }
  if (!input.token.trim()) return counts
  const request = input.request ?? fetch
  const deadline = input.deadlineAtMs ?? Date.now() + 15_000
  const sha = /^[0-9a-f]{40}$/i
  for (const repair of input.pending.slice(0, 4)) {
    if (Date.now() >= deadline) break
    if (!Number.isInteger(repair.pullRequestNumber) || repair.pullRequestNumber < 1 || !sha.test(repair.repairCommitSha)) continue
    counts.inspected++
    try {
      const response = await request(`https://api.github.com/repos/SignalBoost/signalboost-live/pulls/${repair.pullRequestNumber}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${input.token}` },
        signal: AbortSignal.timeout(Math.max(1, Math.min(5_000, deadline - Date.now()))),
      })
      if (!response.ok) { counts.errors++; continue }
      const pull = await response.json()
      // Metadata in a public PR body is not authority; bind the observed merge to the saved job.
      if (pull.number !== repair.pullRequestNumber || pull.merged !== true || pull.state !== 'closed'
        || pull.base?.ref !== repair.baseBranch || pull.head?.sha !== repair.repairCommitSha
        || pull.base?.repo?.full_name !== 'SignalBoost/signalboost-live'
        || pull.head?.repo?.full_name !== 'SignalBoost/signalboost-live'
        || !sha.test(String(pull.merge_commit_sha || ''))) continue
      // Production completion still requires the existing durable watch and live acceptance.
      if (repair.baseBranch === 'main' && !repair.preMergeSnapshotId) continue
      if (await input.complete({ pullRequestNumber: repair.pullRequestNumber,
        mergeCommitSha: pull.merge_commit_sha, baseBranch: repair.baseBranch,
        preMergeSnapshotId: repair.preMergeSnapshotId, mergeEvidence: 'observed_github' })) counts.completed++
    } catch { counts.errors++ }
  }
  return counts
}
