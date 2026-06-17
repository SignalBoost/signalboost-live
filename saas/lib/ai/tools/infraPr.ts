// lib/ai/tools/infraPr.ts
// Chief of Staff tool. The AI acts as the developer: it generates the exact
// provider payload, then DRAFTS it as a pending PR instead of executing.
// Mirrors the repoWriter / proposeCodeCommit pattern. Register the tool def
// in your COS tool registry and route the call to proposeInfrastructurePr().
import { createInfraPr, InfraRisk } from '@/lib/infra-pr/store';

export const proposeInfrastructurePrTool = {
  type: 'function' as const,
  function: {
    name: 'proposeInfrastructurePr',
    description:
      'Draft an infrastructure change as a pending Pull Request. Use this for ANY action that writes to a provider (Vercel env vars, Supabase, GitHub, Stripe, etc.) INSTEAD of executing it. The change is saved and shown to the owner as an Open PR; it does NOT run until the owner clicks Merge. Fully fill in the payload exactly as the Hub action engine expects.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Short human summary, e.g. "Set STRIPE_WEBHOOK_SECRET in Vercel (production)"',
        },
        description: {
          type: 'string',
          description: 'What this change does and why it is needed',
        },
        service: {
          type: 'string',
          description: 'Provider: vercel | supabase | github | stripe | openai | resend | ...',
        },
        action: {
          type: 'string',
          description: 'The template / action id this payload runs in the Hub action engine',
        },
        payload: {
          type: 'object',
          description:
            'The EXACT JSON body accepted by /api/hub/action for this template, with every input filled in. This is replayed verbatim on merge.',
        },
        diff: {
          type: 'object',
          description:
            'Optional before/after preview for the reviewer, e.g. { key, before, after }',
        },
        triggers_redeploy: {
          type: 'boolean',
          description:
            'True if merging should also trigger a production redeploy (env-var and config changes usually need this).',
        },
      },
      required: ['title', 'service', 'action', 'payload'],
    },
  },
};

function classifyRisk(service: string, triggersRedeploy?: boolean): InfraRisk {
  if (triggersRedeploy) return 'high';
  const high = ['vercel', 'supabase', 'github', 'stripe'];
  return high.includes((service || '').toLowerCase()) ? 'high' : 'medium';
}

export async function proposeInfrastructurePr(
  args: any,
  ctx: { userId?: string | null } = {},
): Promise<{ ok: boolean; pr_id?: string; status?: string; message?: string; error?: string }> {
  if (!args || !args.title || !args.service || !args.action || args.payload === undefined) {
    return { ok: false, error: 'title, service, action and payload are required' };
  }

  const created = await createInfraPr({
    title: String(args.title),
    description: args.description ?? null,
    service: String(args.service),
    action: String(args.action),
    payload: args.payload,
    diff: args.diff ?? null,
    triggers_redeploy: !!args.triggers_redeploy,
    risk: classifyRisk(args.service, args.triggers_redeploy),
    source: 'assistant',
    created_by: ctx.userId ?? null,
  });

  if (!created.ok) return { ok: false, error: created.error };

  return {
    ok: true,
    pr_id: created.data.id,
    status: 'open',
    message:
      `Drafted PR "${created.data.title}". It is PENDING your approval at /dashboard/infrastructure ` +
      `and will NOT run until you click Merge.`,
  };
}
