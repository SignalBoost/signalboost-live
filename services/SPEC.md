# COS Builder v0 spec

## Product rule

COS is the brain. Concierge is the public face.

A coding request to Concierge is still executed by COS. There is one Builder, two doors.

```
user
  ├─ Concierge (public face) ──┐
  │                            ├─ classify
  └─ COS (brain / operator) ───┘     │
                                     ├ not coding → that face's normal path
                                     └ coding     → COS BuilderSession
                                                   skip skill retrieval
                                                   sandbox tools only
                                                   refuse COS self-modify
```

Out of scope for v0:

- Rewriting COS or Concierge
- Opening the live COS repo
- Full multi-language IDE
- Cognitive-skills retrieval (bypass until that layer is not inert)

## Classifier

Mark coding if any of these are true:

- Intent keywords: code, debug, traceback, stack trace, compile, refactor, function, script, implement, unit test, typeerror, syntaxerror, etc.
- Fenced code block
- Attachment with a code/log extension

Self-modify markers (`rewrite cos`, `concierge internals`, `promotion pipeline`, …) set `refuse_self_modify`. That is not a user coding job.

## Sandbox

- `sandboxes/<session_id>/`
- Tools only touch that tree
- No `.env` / key files
- Run timeout 30s, no network in v0
- Caps: 12 writes and 8 runs per turn
- Allowed binaries: `python3`, `node`, `pytest`

## Response contract

Every Builder turn returns: what it understood, files changed, command + output, next step.

Never “ask another agent.”
