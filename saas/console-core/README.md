# Portable Console Core

A provider-agnostic, host-agnostic command console. It discovers providers from
config, renders forms from schemas, and routes every action through swappable
auth / logging / execution adapters — so it can be detached from this app and
dropped into another company's stack.

## What's here (Phase 1)

| File | Role |
|---|---|
| `types.ts` | All portable contracts: `ProviderAdapter`, `AuthAdapter`, `LogAdapter`, `ActionSchema`, `ActionExecutor`, `ConsoleHost`. No app imports. |
| `console.config.ts` | The ONE file a host edits: enabled providers, env remapping, adapter selection. |
| `providerRegistry.ts` | Builds the live registry from `config/provider-map.json` + config. The UI discovers providers here, never from hard-coded imports. |
| `../components/hub/ProviderMapGrid.tsx` | Schema-driven sidebar/grid. Renders every provider by tier, paints Connected / Not Connected from the status endpoint. |
| `../app/api/hub/providers/status/route.ts` | Computes status from env-var presence. Returns booleans only — never values. |
| `../config/provider-map.json` | The provider data model (28 providers, 4 tiers). |

## Add a provider

Edit `config/provider-map.json` — add an entry with `tier`, `displayName`,
`accent`, `icon`, `envVars`, `actions`, `remoteSelect`, `remoteList`. It appears
in the grid automatically and self-greys until its required env vars are set.
No code change.

## Add an action

Add it under the provider's `actions` (or as a template id the action engine
resolves). Declare its fields as an `ActionSchema`; `remote_select` / `remote_list`
fields reference a list-action via `remoteSource`. The renderer draws it; no
bespoke UI.

## Swap auth

Implement `AuthAdapter` (`getCurrentUser`, `hasPermission`) for Auth0 / Clerk /
custom JWT and set `authAdapter` in `console.config.ts`. All permission checks go
through this adapter — nothing calls the host auth system directly.

## Swap logging

Implement `LogAdapter` (`logAction`) for Datadog / Logflare / CloudWatch and set
`logAdapter` in `console.config.ts`.

## Embed in another Next.js app

1. Copy `console-core/`, `components/hub/`, `config/provider-map.json`, and the
   `app/api/hub/*` routes.
2. Provide a `ConsoleHost` (auth + log + `resolveExecutor`).
3. Edit `console.config.ts`.
4. Mount `<ProviderMapGrid onSelect={openWorkspace} />`.

## Migration plan (don't big-bang)

Phase 1 (this drop): portable contracts + registry + config + schema-driven grid
+ status engine — all additive, zero changes to working handlers.

Phase 2: introduce the `actionEngine` that validates input against `ActionSchema`,
checks `AuthAdapter`, calls the resolved `ActionExecutor`, logs via `LogAdapter`.
Wire the EXISTING `/api/hub/action` route to call it — behavior preserved.

Phase 3: wrap current provider handlers as `ActionExecutor`s, one provider at a
time, behind `resolveExecutor`. Each move is independently testable.

Phase 4: extract `console-core` to its own package; the host keeps only glue.
