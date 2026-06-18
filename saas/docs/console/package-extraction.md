# Package Extraction Guide

The audit's recommended end-state is a workspace layout:

```
packages/
  console-core/        # host-agnostic engine + executors
  console-ui/          # the shell + cards + pages
  pr-cockpit/          # the PR engine + routes + UI
examples/
  signalboost-host/    # this app, as ONE example host
  generic-nextjs-host/
```

## Why this is a deliberate migration, not a file-by-file edit

The console code is already **logically** separated:

- `console-core/` imports nothing app-specific (verified: no `@/` imports). It
  now also exposes a single public entrypoint, `console-core/index.ts`.
- The shell (`components/hub/console/CommandConsole.tsx`) receives its host
  config by prop — it has no SignalBoost import.
- Provider templates and the GitHub executor carry **no** SignalBoost defaults;
  they read from env.

What remains for a *physical* `/packages` move is mechanical but invasive: every
deep import (`@/console-core/*`, `@/lib/hub/*`, `@/components/hub/*`) must be
repointed to the new package specifiers, and a workspace (npm/pnpm) plus a
per-package `package.json` and `tsconfig` must be added. Doing this one file at a
time through a web editor would leave the build broken between commits.

**Recommendation:** perform the move on a branch with local tooling, in one pass,
then verify `build` + `test` before merging. Steps below.

## Suggested steps (on a branch, local)

1. Add a workspace root (`package.json` with `workspaces` or `pnpm-workspace.yaml`).
2. Create `packages/console-core/` and move the current `console-core/` into it.
   Add a minimal `package.json`:

   ```json
   {
     "name": "@yourco/console-core",
     "version": "0.1.0",
     "type": "module",
     "main": "./index.ts",
     "types": "./index.ts"
   }
   ```

3. Repeat for `console-ui` (the `components/hub` shell) and `pr-cockpit`
   (`lib/hub/pr-engine.ts`, `lib/hub/pr-redact.ts`, `app/api/infra-pr/*`,
   the cockpit UI).
4. Repoint imports from deep `@/` paths to the package names
   (`@yourco/console-core`, …). A codemod (e.g. `ts-morph` or a scripted
   find-replace) handles the bulk.
5. Make `examples/signalboost-host/` the app that depends on those packages and
   supplies its own `ConsoleHostUI` and env.
6. Run `build` and the full test suite; fix path/type fallout in one pass.

## Until then

`console-core/index.ts` makes the package **extractable today** without changing
any existing import — the app keeps using its current deep paths, and the barrel
is the seam a buyer (or the migration above) imports from.
