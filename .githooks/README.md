# Local commit hooks

This repository includes tracked local commit hooks:

```bash
.githooks/prepare-commit-msg
.githooks/pre-commit
```

Every contributor may enable them after cloning:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/prepare-commit-msg
```

The hooks deliberately do not modify, stage, or require `ONBOARD.md`. Documentation
updates remain a contributor responsibility and never block a commit or merge.
