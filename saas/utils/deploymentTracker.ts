export async function getDeploymentStatus(jobId: string) {
  return {
    jobId,
    provider: 'vercel',
    state: 'published',
    message: 'Deployment status integration placeholder.',
  }
}
