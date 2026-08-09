// saas/app/api/ai-portability/[...slug]/route.ts
/**
 * AI Portability — API route
 * Mounts the portable at /api/ai-portability/*.
 *   GET  /api/ai-portability/providers
 *   POST /api/ai-portability/invoke
 *   POST /api/ai-portability/blend
 *   GET  /api/ai-portability/report
 */

import { createOrchestrator } from '@/ai-portability-core';
import {
  createSignalBoostAiPortabilityHost,
  toNextHandlers,
} from '@/ai-portability-host';

const orch = createOrchestrator(createSignalBoostAiPortabilityHost(), {
  providers: [
    { kind: 'openai', secretRef: 'OPENAI_API_KEY' },
    { kind: 'anthropic', secretRef: 'ANTHROPIC_API_KEY' },
    { kind: 'cohere', secretRef: 'COHERE_API_KEY' },
  ],
  routing: {
    defaultPolicy: 'auto',
    defaultFallback: ['openai', 'anthropic'],
  },
});

const handlers = toNextHandlers(orch, '/api/ai-portability');
export const GET = handlers.GET;
export const POST = handlers.POST;
