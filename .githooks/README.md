# Local ONBOARD Commit Guard

This repository includes tracked local commit hooks:

```bash
.githooks/prepare-commit-msg
.githooks/pre-commit
```

Every contributor must enable them after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/prepare-commit-msg
```

What they do:

- `prepare-commit-msg` checks staged files during commit preparation.
- If critical platform paths are staged and `ONBOARD.md` is not staged, it automatically appends a short ONBOARD note and stages `ONBOARD.md`.
- `pre-commit` remains a guardrail: if critical files are staged but `ONBOARD.md` is still missing, it blocks the commit and tells the developer what failed and how to fix it.

This gives two local layers:

1. Auto-update ONBOARD when possible.
2. Block the commit if ONBOARD is still missing.

GitHub PR checks remain the backstop if a contributor skips local hook setup or edits files through the web UI.
