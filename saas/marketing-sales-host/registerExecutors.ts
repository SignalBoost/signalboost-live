// saas/marketing-sales-host/registerExecutors.ts
// Deterministic executor registration for the SignalBoost host: load the portable
// core (registers site + gated stubs) FIRST, then the real host connectors, which
// overwrite the matching stub ids. Import THIS from any publish entry point.
import '@/marketing-sales-core'
import './executors/social'
