# Developer Guide

How to extend the Hub Console: add a new provider, a new action, or a new console
card. The console is built around a small **portable engine** (`console-core/`)
that runs any registered action through a fixed pipeline, plus a **catalog**
(`lib/hub/`) that describes how providers and actions appear in the UI.

---

## Architecture in one screen

```
UI card (console-catalog.ts)
        │  user clicks an action
        ▼
action pipeline:  validate → permission → execute → audit
        │
        ├─ permission:  policyActionId → action-policy.ts  (block / approve / allow)
        ├─ execute:     registered executor.run()            (console-core)
        └─ audit:       recordAuditEvent()                   (lib/hub/audit.ts)
```

- **`console-core/`** — the portable engine. It knows nothing about your app's
  DB or auth; a host supplies those through adapters (`createDefaultHost`).
- **Executors** register themselves at module load via `registerExecutor(...)`.
- **`lib/hub/`** — the catalog (`console-catalog.ts`), action templates
  (`provider-templates.ts`), and policies (`action-policy.ts`).
- Every action is policy-checked and audited automatically — you don't wire that
  per action.

---

## Add a new provider (engine-based) — the recipe

Five edits. Example: a provider called `acme`.

### 1. Write the executor

Create `console-core/executors/acme.ts`. Register one executor per action:

```ts
import { registerExecutor } from '../defaultHost'
import type { ActionSchema } from '../types'

const API = 'https://api.acme.com'
function key(): string | null { return process.env.ACME_API_KEY || null }

async function getJSON(path: string) {
  const k = key()
  if (!k) return { ok: false as const, error: 'ACME_API_KEY not set' }
  const res = await fetch(`${API}${path}`, { headers: { Authorization: 'Bearer ' + k } })
  if (!res.ok) return { ok: false as const, error: `Acme error (HTTP ${res.status})` }
  return { ok: true as const, json: await res.json() }
}

registerExecutor({
  providerId: 'acme',
  actionId: 'list_widgets',
  policyActionId: 'read_provider_status',   // maps to action-policy.ts
  schema: { id: 'acme.list_widgets', label: 'List Widgets', verb: 'view', fields: [] },
  async run() {
    const r = await getJSON('/widgets')
    if (!r.ok) return r
    const widgets = (r.json.data || []).map((w: any) => ({ id: w.id, name: w.name }))
    return { ok: true, message: `${widgets.length} widgets`, data: { count: widgets.length, widgets } }
  },
})
```

**`run()` contract:** return `{ ok: true, message?, data? }` on success, or
`{ ok: false, error }` on failure. Read provider credentials from
`process.env` and fail gracefully when a key is absent (never throw).

### 2. Register the executor file

Add a side-effect import to `app/api/hub/action/engine/route.ts` (these run at
module load and self-register):

```ts
import '@/console-core/executors/acme'
```

### 3. Add the card to the catalog

In `lib/hub/console-catalog.ts`, add an entry to `CONSOLE_PROVIDERS` (id, name,
subtitle, accent, tier, and `sections` listing the action template ids), then add
the provider id to `LIVE_PROVIDER_IDS` so it isn't shown as "coming soon":

```ts
export const LIVE_PROVIDER_IDS = new Set<string>([
  /* …existing… */ 'acme',
])
```

### 4. Add action templates (for the form UI)

In `lib/hub/provider-templates.ts`, define a template per action. Templates drive
the card's button, icon, and — for write actions — the input form:

```ts
{
  id: 'acme.list_widgets',
  policyActionId: 'read_provider_status',
  label: 'List Widgets',
  description: 'View all widgets in the account.',
  icon: '🧩',
  api: { service: 'Acme', method: 'GET', endpoint: '/widgets' },
  fields: [],   // write actions list ActionField inputs here
}
```

### 5. Confirm the policy

Each action's `policyActionId` must exist as a key in
`lib/hub/action-policy.ts`. If it doesn't, the action **fail-closes to blocked**
(by design). Reuse an existing policy (e.g. `read_provider_status` for reads,
`delete_provider_resource` for destructive actions) or add a new policy entry.

That's it — permission checks and audit logging happen automatically through the
pipeline.

---

## Action schema & form fields

A write action collects input through `fields`. An `ActionField` is:

```ts
{
  id: string
  label: string
  type: FieldType            // text, number, select, remote_select, remote_list, …
  required?: boolean
  options?: { label: string; value: string }[]   // for static select
  remoteSource?: …           // for remote_select / remote_list: the list-action
}                            //   that supplies the options
```

`ActionSchema` wraps them: `{ id, label, description?, verb?, fields }` where
`verb` is one of `create | view | edit | archive | delete` (or a custom verb).
The verb informs the UI's styling and the policy's risk treatment.

---

## Add a new action to an existing provider

1. Add another `registerExecutor({ … })` block in that provider's executor file.
2. Add a matching template in `provider-templates.ts` and list its id in the
   provider's `sections` in `console-catalog.ts`.
3. Point `policyActionId` at the right policy.

No engine-route change is needed — the file is already imported.

---

## Add a console card / page

Provider cards are rendered from `CONSOLE_PROVIDERS` by
`components/hub/console/ProviderConsoleCard.tsx`. To add a card, add the provider
to the catalog (step 3 above). Utility pages (Domains, Deployments, Logs,
Settings) are listed in `CONSOLE_UTILITY_PAGES` and routed by `CommandConsole`.

The card automatically respects `isProviderLive()`: providers not in
`LIVE_PROVIDER_IDS` render disabled with a "Soon" badge, so you can ship a card
before its executor is finished without exposing a broken action.

---

## Verify your wiring

The engine route exposes a GET that lists every registered executor — use it to
confirm registration without clicking through the UI:

```bash
curl https://your-domain.com/api/hub/action/engine     # GET → registered providers/actions
```

Then run `npm run build` (or rely on the CI workflow) to typecheck the whole
surface before committing.

---

## Conventions

- Executors must be **portable**: read only `process.env` and the action payload;
  never import app DB models or auth into `console-core/`.
- Destructive actions (delete/disable/empty/purge) must map to a destructive
  policy so they're owner-gated and audited.
- Keep `run()` failure-safe: return `{ ok: false, error }`, never throw.
- New env vars go in `.env.example` with a comment.
