import type { CodeRepairFailureInput } from './contracts.ts'
import type { GitHubWorkflowFailureSnapshot, GitHubWorkflowJobSnapshot } from './diagnosis-contracts.ts'

function failedJob(jobs: readonly GitHubWorkflowJobSnapshot[]): GitHubWorkflowJobSnapshot | undefined {
  return jobs.find(job => job.conclusion === 'failure' || job.conclusion === 'timed_out' || job.conclusion === 'cancelled')
}

function failedStep(job: GitHubWorkflowJobSnapshot | undefined): string | undefined {
  return job?.steps.find(step => step.conclusion === 'failure' || step.conclusion === 'timed_out' || step.conclusion === 'cancelled')?.name
}

export function observeGitHubWorkflowFailure(snapshot: GitHubWorkflowFailureSnapshot): CodeRepairFailureInput {
  if (!snapshot.repository.trim()) throw new Error('GitHub failure snapshot requires repository.')
  if (!snapshot.commitSha.trim()) throw new Error('GitHub failure snapshot requires commit SHA.')
  if (!Number.isSafeInteger(snapshot.runId) || snapshot.runId <= 0) throw new Error('GitHub failure snapshot requires a positive run ID.')
  const job = failedJob(snapshot.jobs)
  if (!job) throw new Error('GitHub workflow snapshot does not contain a failed job.')
  const logs = [
    `Workflow: ${snapshot.workflowName}`,
    `Run: ${snapshot.runId}`,
    `Job: ${job.name}`,
    `Conclusion: ${job.conclusion ?? 'unknown'}`,
    job.logs ?? '',
  ].filter(Boolean).join('\n')
  return Object.freeze({
    incidentId: `github:${snapshot.repository}:${snapshot.runId}:${job.id}`,
    repository: snapshot.repository,
    commitSha: snapshot.commitSha,
    workflowName: snapshot.workflowName,
    failedJob: job.name,
    failedStep: failedStep(job),
    logs,
    changedFiles: snapshot.changedFiles,
  })
}
