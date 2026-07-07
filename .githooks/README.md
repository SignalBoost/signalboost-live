# Local ONBOARD Commit Guard

This repository includes a tracked local pre-commit guard:

```bash
.githooks/pre-commit
```

Every contributor must enable it after cloning:

```bash
git config core.hooksPath .githooks
```

What it does:

- Checks staged files before a local commit is created.
- If critical platform paths are staged, `ONBOARD.md` must also be staged.
- If `ONBOARD.md` is missing from the commit, the commit is blocked.
- The message tells the developer what failed, which files triggered the rule, and how to fix it.

This is the earliest practical local enforcement point. GitHub PR checks remain the backstop if a contributor skips local hook setup or edits files through the web UI.
