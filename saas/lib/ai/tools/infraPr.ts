// saas/lib/ai/tools/infraPr.ts
// Chief of Staff tool. ONE generic tool for ANY provider write (GitHub,
// Vercel, Supabase, Stripe, ...). The model fills the exact payload; this
// routes it through the system-wide policy and drafts a pending PR.
// It never executes — the owner merges.
import { routeInfrastructureWrite } from '@/lib/hub/infra-pr-router';

export const proposeInfrastructurePrTool = {
  type: 'function' as const,
  function: {
    name: 'proposeInfrastructurePr',
    description:
      'Package ANY provider write (GitHub, Vercel, Supabase, Stripe, OpenAI, ...) as a pending Infrastructure PR INSTEAD of executing it. Provider-agnostic. Risk and approval tier are assigned automatically by action type; high-risk destructive actions require a second confirm. Use this for every create/update/delete intent across all providers. Read-only lookups do not need a PR.',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          description: 'Provider id: github | vercel | supabase | stripe | openai | resend | ...',
        },
        actionId: {
          type: 'string',
          description:
            'The action/template id, e.g. create_env_var, delete_branch, query, create_product, insert_row.',
        },
        payload: {
          type: 'object',
          description:
            'Provider-agnostic args block (Record<string,any>) — the EXACT body /api/hub/action expects for this action, fully filled in. Replayed verbatim on merge.',
        },
        title: { type: 'string', description: 'Short human summary of the change.' },
        description: { type: 'string', description: 'What it does and why it is needed.' },
        verb: {
          type: 'string',
          enum: ['read', 'create', 'update', 'delete'],
          description: 'Optional explicit CRUD verb; inferred from actionId when omitted.',
        },
      },
      required: ['provider', 'actionId', 'payload', 'title'],
    },
  },
};

export async function proposeInfrastructurePr(
  args: any,
  ctx: { userId?: string | null; elevated?: boolean } = {},
): Promise<{
  ok: boolean;
  pr_id?: string;
  tier?: string;
  risk?: string;
  message?: string;
  error?: string;
}> {
  if (!args || !args.provider || !args.actionId || args.payload === undefined || !args.title) {
    return { ok: false, error: 'provider, actionId, payload and title are required' };
  }

  return routeInfrastructureWrite({
    provider: String(args.provider),
    actionId: String(args.actionId),
    payload: args.payload,
    title: String(args.title),
    description: args.description ?? null,
    verb: args.verb,
    elevated: ctx.elevated ?? false,
    userId: ctx.userId ?? null,
  });
}
