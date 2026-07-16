# Mission001.md GitHub Commit Script

This helper creates and commits a new `Mission001.md` file directly to the `SignalBoost/signalboost-live` repository on the `main` branch by using the GitHub Git Data API through `@octokit/rest`.

## 1. Install the required packages

From the repository root, run:

```bash
npm install @octokit/rest dotenv
```

## 2. Add your GitHub token locally

Create a local `.env` file in the repository root:

```bash
touch .env
```

Add your GitHub Personal Access Token (PAT):

```env
GITHUB_TOKEN=github_pat_your_token_here
```

The token needs permission to write repository contents for `SignalBoost/signalboost-live`. Do not commit `.env` or paste the token into chat, logs, screenshots, issues, commits, or pull requests.

## 3. Add your campaign brief

Open `scripts/create-mission001.mjs` and replace the placeholder text inside the `missionBrief` markdown string:

```md
PASTE_YOUR_AI_CAMPAIGN_BRIEF_HERE
```

Keep secrets, private keys, credentials, and unpublished sensitive customer data out of the markdown content.

## 4. Run the script

From the repository root, run:

```bash
node scripts/create-mission001.mjs
```

The script will:

1. Authenticate with `GITHUB_TOKEN` from `.env`.
2. Fetch the latest `main` branch commit SHA.
3. Read the latest commit tree.
4. Create a blob for `Mission001.md`.
5. Create a new tree containing `Mission001.md`.
6. Create a commit with the message `chore: add Mission001.md campaign brief`.
7. Update `refs/heads/main` to the new commit SHA.

If `Mission001.md` already exists, this script will replace it in the new commit because the tree entry uses the same path.
