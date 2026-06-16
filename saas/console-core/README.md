# Portable Console Core

A provider-agnostic, host-agnostic command engine. It runs every console action
through a fixed pipeline — **validate → permission → execute → log** — behind
swappable adapters, so the engine can be detached from this app and dropped into
another company's stack with only thin glue.

Providers and their actions are defined by **executors** that register themselves
at module load. There is no central provider data file to keep in sync — adding a
provider means adding an executor.

## What's here

| File | Role |
|---|---|
| `types.ts` | Portable contracts: `ActionSchema`, `ActionField`, `AuthAdapter`, `LogAdapter`. No app imports — this is the whole point. |
| `defaultHost.ts` | `registerExecutor()` (executors self-register here), `resolveExecutor()`, `listRegistered()`, and `createDefaultHost(req)` which wires the default auth/log/resolve adapters. |
| `actionEngine.ts` | `runAction(host, { providerId, actionId, input })` — the validate → permission → execute → log pipeline, plus `validateInput()`. |
| `executors/` | One file per provider (`openai.ts`, `github.ts`, `resend.ts`, …). Each calls `registerExecutor(...)` for its actions. |

The engine is consumed by `../app/api/hub/action/engine/route.ts`, which
side-effect-imports each executor file (registering it) and calls `runAction`.

## Add a provider

1. Create `executors/<provider>.ts` and call `registerExecutor({ providerId,
   actionId, policyActionId, schema, run })` for each action. `run()` returns
   `{ ok: true, message?, data? }` or `{ ok: false, error }`, reading credentials
   from `process.env`.
2. Add a side-effect import to `app/api/hub/action/engine/route.ts`:
   `import '@/console-core/executors/<provider>'`.
3. Register the card in `lib/hub/console-catalog.ts` and add the provider id to
   `LIVE_PROVIDER_IDS`.

See `../docs/developer-guide.md` for the full, worked example.

## Add an action

Add another `registerExecutor({ … })` block in the provider's executor file and a
matching template/section in the catalog. Declare inputs as the executor's
`schema.fields` (`ActionField[]`); `remote_select` / `remote_list` fields
reference a list-action via `remoteSource`. No engine-route change is needed.

## Swap auth

Implement `AuthAdapter`:

```ts
interface AuthAdapter {
  getCurrentUser(): Promise<{ id: string; email?: string; roles?: string[] } | null>
  hasPermission(user, providerId: string, actionId: string): boolean | Promise<boolean>
}
```

Build an `EngineHost` with your adapter (`{ auth, log, resolveExecutor }`) and
pass it to `runAction`, instead of `createDefaultHost(req)`. Permission checks go
through this adapter — nothing calls the host auth system directly.

## Swap logging

Implement `LogAdapter` (`logAction(event)`) for Datadog / Logflare / CloudWatch
and supply it on the `EngineHost`. (Within this app, audit events are also routed
through `lib/hub/audit.ts`, which has its own single swap point.)

## Embed in another Next.js app

1. Copy `console-core/` and the `app/api/hub/action/engine` route.
2. Provide an `EngineHost` — your `AuthAdapter`, `LogAdapter`, and the
   `resolveExecutor` from `defaultHost` (or your own).
3. Add the executor side-effect imports you want enabled.
4. Render provider cards from your catalog (`lib/hub/console-catalog.ts` here is
   the reference implementation).

## Verify wiring

`GET /api/hub/action/engine` lists every registered executor, so you can confirm
registration without clicking through the UI.

---

### Note on legacy files

An earlier design discovered providers from a static `config/provider-map.json`
via `providerRegistry.ts` / `console.config.ts`, rendered by
`components/hub/ProviderMapGrid.tsx`. That path is **superseded** by the
executor-based engine described above and is **not mounted by any page**. If
those files are still present, they are safe to remove — the live console
(`console-catalog.ts` + executors) does not use them.
