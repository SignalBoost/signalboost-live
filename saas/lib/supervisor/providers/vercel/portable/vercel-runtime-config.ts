// saas/lib/supervisor/providers/vercel/portable/vercel-runtime-config.ts
//
// Injectable runtime config for the Vercel self-healing workflow. The engine
// (VercelDeploymentHealthIntelligence) already accepts secretResolver/store/client as
// constructor dependencies — it was ALREADY portable. The only coupling was the wrapper
// function that used to build those from process.env directly (see trigger-ingestion.ts's
// original runAcceptedVercelWork). This file is the shape a buyer fills in: their secrets
// vault, their durable run-history store, their own observation windows.
import type { VercelHealthClient, VercelHealthStore } from '../health-intelligence.ts'
import type { VercelProviderConnection } from '../trigger-ingestion.ts'

export interface VercelObservationRuntimeConfig {
  providerConnectionId: string
  // A buyer's vault lookup: given the connection id, return the Vercel API token (or '').
  secretResolver: (providerConnectionId: string) => Promise<string> | string
  // A buyer's durable store for run history — their own database, not Supabase-specific.
  healthStore: VercelHealthStore
  client?: VercelHealthClient
  lookbackWindowMs?: number
  maxDeployments?: number
  maxAttempts?: number
  softwareVersion?: string
}

// A buyer supplies where active Vercel connections come from — their own table, config
// file, or a static list. No assumption about a `provider_connections` table.
export interface VercelConnectionSource {
  list(limit: number): Promise<VercelProviderConnection[]> | VercelProviderConnection[]
}

// Simplest possible source: a fixed, already-known list of connections (good for a
// single-project self-hosted deployment with no connection table at all).
export function staticConnectionSource(connections: VercelProviderConnection[]): VercelConnectionSource {
  return { list: (limit) => connections.slice(0, limit) }
}
