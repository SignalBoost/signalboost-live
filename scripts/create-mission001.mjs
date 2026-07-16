#!/usr/bin/env node
import 'dotenv/config'
import { Octokit } from '@octokit/rest'

const owner = 'SignalBoost'
const repo = 'signalboost-live'
const branch = 'main'
const filePath = 'Mission001.md'
const commitMessage = 'chore: add Mission001.md campaign brief'

const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT

if (!token) {
  console.error('Missing GitHub token. Add GITHUB_TOKEN=your_pat_here to a local .env file before running this script.')
  process.exit(1)
}

const missionBrief = `# Mission 001 Campaign Brief

<!--
Paste your drafted AI campaign brief below this comment before running the script.
Keep secrets, private keys, customer credentials, and unpublished sensitive data out of this file.
-->

## Draft Campaign Brief

PASTE_YOUR_AI_CAMPAIGN_BRIEF_HERE
`

const octokit = new Octokit({ auth: token })

async function createMissionBrief() {
  const { data: reference } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  })

  const latestCommitSha = reference.object.sha

  const { data: latestCommit } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: latestCommitSha,
  })

  const { data: blob } = await octokit.git.createBlob({
    owner,
    repo,
    content: Buffer.from(missionBrief, 'utf8').toString('base64'),
    encoding: 'base64',
  })

  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: latestCommit.tree.sha,
    tree: [
      {
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      },
    ],
  })

  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: tree.sha,
    parents: [latestCommitSha],
  })

  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.sha,
    force: false,
  })

  console.log(`Created ${filePath} on ${owner}/${repo}@${branch}.`)
  console.log(`Commit: ${commit.sha}`)
}

createMissionBrief().catch((error) => {
  const status = error.status ? `GitHub API status ${error.status}: ` : ''
  console.error(`${status}${error.message}`)
  process.exit(1)
})
