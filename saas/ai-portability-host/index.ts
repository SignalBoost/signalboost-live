// saas/ai-portability-host/index.ts
/**
 * AI Portability — host public surface.
 */
export { createSignalBoostAiPortabilityHost } from './signalboostHost.ts';
export { createHttpHandler, toNextHandlers } from './http-handler.ts';
export type { HttpRequest, HttpResponse } from './http-handler.ts';
