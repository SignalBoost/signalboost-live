# Local Git Hooks

This repository keeps tracked compatibility hooks at:

```bash
.githooks/prepare-commit-msg
.githooks/pre-commit
```

Contributors may enable them after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/prepare-commit-msg
```

## Current behavior

- The hooks do not require `ONBOARD.md` to be staged.
- The hooks do not append notes to, modify, or stage `ONBOARD.md`.
- The hooks do not block commits based on changed paths.
- Existing lint, test, security, approval, role-validation, and other repository checks are not changed by this retirement.

The compatibility files remain so existing clones that use `core.hooksPath=.githooks` continue to work without errors.
