// lib/infra-pr/tool.ts
// Chief of Staff tool. ONE generic tool for ANY provider write. Routes
// through the policy + simulation and drafts a pending PR. Never executes.
import { routeInfrastructureWrite } from './router';

export const proposeInfrastructurePrTool = {
  type: 'function' as const,
  function: {
    name: 'proposeInfrastructurePr',
    description:
      'Package ANY provider write (GitHub, Vercel, Supabase, Stripe, OpenAI, ...) as a pending Infrastructure PR INSTEAD of executing it. Provider-agnostic. Risk, approval tier, required role, and a dry-run diff are computed automatically. Use for every create/update/delete intent across all providers. Read-only lookups do not need a PR.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'github | vercel | supabase | stripe | openai | resend | ...' },
        actionId: { type: 'string', description: 'Action/template id, e.g. create_env_var, delete_branch, query, create_product.' },
        payload: { type: 'object', description: 'Provider-agnostic args block — the EXACT body the engine expects, fully filled. Replayed verbatim on merge.' },
        title: { type: 'string', description: 'Short human summary of the change.' },
        description: { type: 'string', description: 'What it does and why.' },
        verb: { type: 'string', enum: ['read', 'create', 'update', 'delete'], description: 'Optional explicit CRUD verb; inferred from actionId when omitted.' },
      },
      required: ['provider', 'actionId', 'payload', 'title'],
    },
  },
};

export async function proposeInfrastructurePr(
  args: any,
  ctx: { userId?: string | null; role?: string | null } = {},
): Promise<{ ok: boolean; pr_id?: string; tier?: string; risk?: string; requiredRole?: string; message?: string; error?: string }> {
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
    role: ctx.role ?? null,
    userId: ctx.userId ?? null,
  });
}
