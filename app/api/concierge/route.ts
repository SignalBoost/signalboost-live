/**
 * Public Concierge ingress is intentionally a thin alias for the governed COS
 * support handler. Do not add regex routers or response workflows here.
 */
export { dynamic, GET, POST } from '@/app/api/support/route'
