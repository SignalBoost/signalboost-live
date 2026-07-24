// saas/ai-portability-host/index.ts
/**
 * AI Portability — host public surface.
 */
export { createSignalBoostAiPortabilityHost } from './signalboostHost';
export { createHttpHandler, toNextHandlers } from './http-handler';
export type { HttpRequest, HttpResponse } from './http-handler';
