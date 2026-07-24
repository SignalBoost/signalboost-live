// saas/ai-portability-host/http-handler.ts
/**
 * AI Portability — HTTP Handler
 * -------------------------------------------------------------------------
 * A pure request->response function the buyer mounts anywhere. No framework
 * lock-in. A thin Next.js App Router wrapper is included; write your own for
 * Express/Fastify/Lambda in three lines the same way.
 *
 * Routes:
 *   GET  /providers        -> provider metadata (drives the UI dropdown)
 *   POST /invoke           -> { ...UnifiedRequest }              -> UnifiedResponse
 *   POST /blend            -> { request, strategy, providers, fuser? }
 *   GET  /report?from&to&tenant&groupBy                          -> Report
 */

import { Orchestrator, BlendOptions, UnifiedRequest } from '@/ai-portability-core';

export interface HttpRequest {
  method: string;
  path: string; // e.g. "/invoke"
  body?: any;
  query?: Record<string, string | undefined>;
}

export interface HttpResponse {
  status: number;
  body: any;
}

export function createHttpHandler(orch: Orchestrator) {
  return async function handle(req: HttpRequest): Promise<HttpResponse> {
    try {
      const path = req.path.replace(/\/+$/, '') || '/';

      if (req.method === 'GET' && path.endsWith('/providers')) {
        return ok({ providers: orch.listProviders() });
      }

      if (req.method === 'POST' && path.endsWith('/invoke')) {
        const request = req.body as UnifiedRequest;
        const response = await orch.invoke(request);
        return ok(response);
      }

      if (req.method === 'POST' && path.endsWith('/blend')) {
        const { request, strategy, providers, fuser, pick } = req.body ?? {};
        const opts: BlendOptions = { strategy, providers, fuser, pick };
        const response = await orch.blend(request as UnifiedRequest, opts);
        return ok(response);
      }

      if (req.method === 'GET' && path.endsWith('/report')) {
        const q = req.query ?? {};
        const report = await orch.report({
          from: q.from ? Number(q.from) : undefined,
          to: q.to ? Number(q.to) : undefined,
          tenant: q.tenant,
          groupBy: (q.groupBy as 'provider' | 'tenant') ?? 'provider',
        });
        return ok(report);
      }

      return { status: 404, body: { error: 'not found' } };
    } catch (err: any) {
      return { status: 502, body: { error: err?.message ?? String(err) } };
    }
  };
}

function ok(body: any): HttpResponse {
  return { status: 200, body };
}

/* --------------------------- Next.js wrapper ---------------------------- */
/* Mount at app/api/ai-portability/[...slug]/route.ts:
 *
 *   import { createOrchestrator } from '@/portables/ai-portability/core/orchestrator';
 *   import { toNextHandlers } from '@/portables/ai-portability/host/http-handler';
 *   const orch = createOrchestrator(buildHost(), buildConfig());
 *   export const { GET, POST } = toNextHandlers(orch, '/api/ai-portability');
 */
export function toNextHandlers(orch: Orchestrator, mountBase = '') {
  const handle = createHttpHandler(orch);

  const adapt = (method: string) => async (request: Request) => {
    const url = new URL(request.url);
    const path = mountBase ? url.pathname.replace(mountBase, '') : url.pathname;
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => (query[k] = v));
    const body =
      method === 'POST' ? await request.json().catch(() => ({})) : undefined;

    const res = await handle({ method, path: path || '/', body, query });
    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  };

  return { GET: adapt('GET'), POST: adapt('POST') };
}
