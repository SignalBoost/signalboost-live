# Wiring the runner into the Chief of Staff — `saas/app/api/support/route.ts`

This is the ONE file I won't hand you as a full replacement: it's 800+ lines and I
only read fragments of it, so a from-memory rewrite would risk dropping content
(exactly what `preservedFraction` in repoWriter is built to refuse). These are
four surgical, additive edits. Each has a unique anchor already in the file.

---

## 1. Import (top of file, next to the repoWriter import on line ~15)

Add below the existing `commitFileToBranch` import:

```ts
import { proposeInfrastructurePR, formatStageResultForAI, listInfraPRsForAI } from '@/lib/ai/tools/infraPRWriter'
```

---

## 2. Tool definitions (near the other `TOOL_*` consts, before `CHIEF_OF_STAFF_TOOLS`)

```ts
const TOOL_PROPOSE_INFRA_PR: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'proposeInfrastructurePR',
    description:
      'Stage a real infrastructure change as an OPEN PULL REQUEST for the owner to approve — do NOT ask permission, the PR IS the proposal. Use whenever the owner asks to change live provider state: set/rotate a Vercel env var, sync a key to Vercel, create/edit a Stripe product or price, run a Supabase migration or SQL, manage a GitHub/Resend/ElevenLabs resource, trigger a redeploy, etc. You act as the developer: produce the EXACT ordered steps, each a real hub templateId (e.g. "vercel.set_env", "supabase.run_migration", "stripe.create_price", "vercel.trigger_redeploy") with a fully-filled payload. Nothing executes now — it fires only when the owner clicks Merge on /hub/prs. Never claim anything was applied; say it is staged for approval.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short imperative title, e.g. "Set STRIPE_WEBHOOK_SECRET on Vercel production".' },
        summary: { type: 'string', description: 'One or two sentences explaining what changes and why.' },
        risk: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Blast radius if this goes wrong. Production env/key/redeploy = high.' },
        steps: {
          type: 'array',
          description: 'Ordered provider calls. Each runs through the live action engine in sequence; a later step never runs if an earlier one fails.',
          items: {
            type: 'object',
            properties: {
              templateId: { type: 'string', description: 'A real hub template id, "provider.action" (e.g. "vercel.set_env").' },
              label: { type: 'string', description: 'Human one-liner for this step.' },
              payload: { type: 'object', description: 'The exact inputs that template requires. No placeholders — real values.' },
            },
            required: ['templateId', 'label', 'payload'],
          },
        },
      },
      required: ['title', 'steps'],
    },
  },
}

const TOOL_LIST_INFRA_PRS: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'listInfrastructurePRs',
    description: 'List the infrastructure pull requests currently OPEN and awaiting the owner\'s Merge on /hub/prs. Call when the owner asks what infra changes are pending approval.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
}
```

---

## 3. Register them (inside the `CHIEF_OF_STAFF_TOOLS` array)

Add these two lines to the array (owner channel only — do NOT add to `CONCIERGE_TOOLS`):

```ts
  TOOL_PROPOSE_INFRA_PR,
  TOOL_LIST_INFRA_PRS,
```

---

## 4. Dispatch (inside `runTool`, next to the `proposeCodeCommit` branch ~line 574)

```ts
  if (name === 'proposeInfrastructurePR') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: staging infrastructure changes is restricted to the owner/admin channel. Do not retry.'
    }
    let args: any = {}
    try { args = JSON.parse(rawArgs || '{}') } catch {}
    const result = await proposeInfrastructurePR(args, { userId, userEmail: null })
    return formatStageResultForAI(result)
  }

  if (name === 'listInfrastructurePRs') {
    if (!isPrivileged) {
      return 'PERMISSION DENIED: infrastructure PRs are owner/admin only. Do not retry.'
    }
    return await listInfraPRsForAI()
  }
```

> Note: `runTool` already receives `userId` and `isPrivileged`. If `userEmail`
> isn't in scope there, leave `userEmail: null` — it's only used for display.

---

## 5. (Optional) One prompt line, in the Chief of Staff system prompt

Next to the existing "ACT WITHOUT ASKING / proposeCodeCommit" doctrine, add:

> For infrastructure changes (provider state: Vercel env/keys, Stripe products,
> Supabase migrations, redeploys, GitHub/Resend/etc.), the equivalent of a commit
> is `proposeInfrastructurePR`. Generate the exact templateIds + payloads and stage
> the PR in the same reply — never ask permission, never claim it ran. It executes
> only when the owner merges it on /hub/prs.

---

# Deploy order

1. Run `20260616_infrastructure_prs.sql` in the **SaaS** Supabase SQL editor
   (project `qpblefwtnbivuusxmabv`).
2. Commit the four new files (paths below).
3. Apply the five edits above to `saas/app/api/support/route.ts`.
4. Confirm these env vars already exist in Vercel (they do, per the action route):
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`,
   `VERCEL_HUB_PROJECT`, `STRIPE_SECRET_KEY`, `GITHUB_WRITE_TOKEN`.

# New file paths

| Deliverable file              | Destination in repo                                  |
|-------------------------------|------------------------------------------------------|
| `20260616_infrastructure_prs.sql` | `saas/supabase/migrations/20260616_infrastructure_prs.sql` |
| `pr-engine.ts`                | `saas/lib/hub/pr-engine.ts`                          |
| `infraPRWriter.ts`            | `saas/lib/ai/tools/infraPRWriter.ts`                 |
| `prs__route.ts`               | `saas/app/api/hub/prs/route.ts`                      |
| `prs__[id]__merge__route.ts`  | `saas/app/api/hub/prs/[id]/merge/route.ts`           |
| `prs__[id]__close__route.ts`  | `saas/app/api/hub/prs/[id]/close/route.ts`           |
| `prs__page.tsx`               | `saas/app/hub/prs/page.tsx`                          |
