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
| `defaultHost.ts` | The portable registry + host assembler: `registerExecutor()` (executors self-register here), `resolveExecutor()`, `listRegistered()`, `consoleLogAdapter` (default `LogAdapter`), and `createHost(auth, log?)`, which assembles an `EngineHost` from an injected `AuthAdapter` (and optional `LogAdapter`). No app imports — auth/policy are injected by the host layer, never imported here. |
| `actionEngine.ts` | `runAction(host, { providerId, actionId, input })` — the validate → permission → execute → log pipeline, plus `validateInput()`. |
| `executors/` | One file per provider (`openai.ts`, `github.ts`, `resend.ts`, …). Each calls `registerExecutor(...)` for its actions. |

The host-specific glue (this app's auth bridge and UI config) lives **outside**
`console-core/`, in `../console-host/` — see [Host layer](#host-layer) below.

The engine is consumed by `../app/api/hub/action/engine/route.ts`, which
side-effect-imports each executor file (registering it), builds the host via
`createSignalBoostHost(req)`, and calls `runAction`.

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

Assemble an `EngineHost` with `createHost(yourAuthAdapter, yourLogAdapter?)` and
pass it to `runAction`. In this app, the bridge lives in
`../console-host/signalboostHost.ts` (`createSignalBoostHost(req)`): it builds the
`AuthAdapter` from the app's auth + policy layers and calls `createHost`.
Permission checks go through this adapter — nothing calls the host auth system
directly.

## Swap logging

Implement `LogAdapter` (`logAction(event)`) for Datadog / Logflare / CloudWatch
and pass it as the second argument to `createHost(auth, log)`. The default,
`consoleLogAdapter`, writes a structured server log. (Within this app, audit
events are also routed through `lib/hub/audit.ts`, which has its own single swap
point.)

## Embed in another Next.js app

1. Copy `console-core/` and the `app/api/hub/action/engine` route.
2. Provide an `EngineHost` via `createHost(yourAuthAdapter, yourLogAdapter?)`
   (`resolveExecutor` is wired in for you), or assemble
   `{ auth, log, resolveExecutor }` yourself.
3. Add the executor side-effect imports you want enabled.
4. Render provider cards from your catalog (`lib/hub/console-catalog.ts` here is
   the reference implementation).

## Verify wiring

`GET /api/hub/action/engine` lists every registered executor, so you can confirm
registration without clicking through the UI. The endpoint is restricted to an
authenticated owner/admin.

---

### Host layer

Everything app-specific lives in `../console-host/`, never in `console-core/`:

- `signalboostHost.ts` — the `AuthAdapter` bridge to this app's auth + policy
  layers, exposed as `createSignalBoostHost(req)`.
- `consoleHostConfig.tsx` — the UI extension (`ConsoleHostUI`): branding, the
  action→panel router, utility pages, and the provider catalog the console shell
  renders.

Another company swaps `console-host/` (its own auth bridge and `ConsoleHostUI`)
and `console-core` is unchanged.
