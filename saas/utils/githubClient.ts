const GITHUB_API = 'https://api.github.com'

export async function createGithubCommit(payload: { owner: string; repo: string; message: string }) {
  return {
    provider: 'github',
    apiBase: GITHUB_API,
    ...payload,
    status: 'stubbed',
  }
}
