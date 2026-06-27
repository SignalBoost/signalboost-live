// saas/lib/hub/bank-registry.ts
//
// Bank connector registry — banks are treated as Hub Console providers, exactly
// like Stripe / Supabase / Vercel. This file is IMPORT-CLEAN (pure data + pure
// functions, no node-only imports, no secrets) so it is safe in both the client
// (card/template rendering) and the server (the engine executor).
//
// Auth model for every connector: Email OTP → OAuth2 token exchange.
//   - The console NEVER stores banking credentials. It facilitates an OTP-gated
//     OAuth2 exchange and stores ONLY the resulting access/refresh tokens, AES-256-GCM
//     encrypted, in the Key Vault (vault_items). Tokens auto-refresh server-side.
//
// Credentials are PLACEHOLDERS until each aggregator app is registered. Each
// connector reads its key/secret/base-URL from env vars; with a generic
// {bank_api_key}/{bank_api_secret} fallback (BANK_API_KEY / BANK_API_SECRET) so a
// single sandbox credential can drive all three during bring-up. When an env var
// is unset the executor returns a clean "not configured — register <VAR>" message
// (never fake/mock data), matching the rest of the console.
//
// Live data pull (balances, transactions, statements, payment initiation) turns
// on automatically once a connector's base URL + key/secret are present.

export type BankAggregator = 'plaid' | 'fdx' | 'discover'

export interface BankConnector {
  /** Stable id used in payloads + vault provider key (`bank:<id>`). */
  id: string
  /** Brand display name (NOT translated — it is a proper noun). */
  name: string
  /** Open-banking aggregator this institution is reached through. */
  aggregator: BankAggregator
  /** Env var holding the API key  (the {bank_api_key} placeholder). */
  keyEnv: string
  /** Env var holding the API secret (the {bank_api_secret} placeholder). */
  secretEnv: string
  /** Env var holding the aggregator base URL for this institution. */
  baseUrlEnv: string
  /** Sensible default base URL (sandbox) used only if baseUrlEnv is unset. */
  defaultBaseUrl: string
  /** Endpoint templates. `{id}` is replaced with the account id at call time. */
  endpoints: {
    otpStart: string
    otpVerify: string   // exchanges the OTP for an OAuth2 token bundle
    tokenRefresh: string
    accounts: string
    balance: string
    transactions: string
    statements: string
    initiatePayment: string
  }
}

// Generic fallback credential names (the literal {bank_api_key}/{bank_api_secret}).
export const GENERIC_BANK_KEY_ENV = 'BANK_API_KEY'
export const GENERIC_BANK_SECRET_ENV = 'BANK_API_SECRET'

// Standard open-banking-style paths shared by all three placeholders. The exact
// routes are finalized per aggregator when real apps are registered; the four
// account/payment paths match the spec the console card advertises.
const STANDARD_ENDPOINTS: BankConnector['endpoints'] = {
  otpStart: '/auth/otp/start',
  otpVerify: '/auth/otp/verify',
  tokenRefresh: '/auth/token/refresh',
  accounts: '/accounts',
  balance: '/accounts/{id}/balance',
  transactions: '/accounts/{id}/transactions',
  statements: '/accounts/{id}/statements',
  initiatePayment: '/payments/initiate',
}

export const BANK_CONNECTORS: BankConnector[] = [
  {
    id: 'statedeptfcu',
    name: 'State Department FCU',
    aggregator: 'plaid',
    keyEnv: 'STATEDEPTFCU_API_KEY',
    secretEnv: 'STATEDEPTFCU_API_SECRET',
    baseUrlEnv: 'STATEDEPTFCU_API_BASE',
    defaultBaseUrl: '', // set once the Plaid app + institution link is registered
    endpoints: STANDARD_ENDPOINTS,
  },
  {
    id: 'usaa',
    name: 'USAA',
    aggregator: 'fdx',
    keyEnv: 'USAA_API_KEY',
    secretEnv: 'USAA_API_SECRET',
    baseUrlEnv: 'USAA_API_BASE',
    defaultBaseUrl: '', // set once the FDX / OpenBanking app is registered
    endpoints: STANDARD_ENDPOINTS,
  },
  {
    id: 'discover',
    name: 'Discover Card',
    aggregator: 'discover',
    keyEnv: 'DISCOVER_API_KEY',
    secretEnv: 'DISCOVER_API_SECRET',
    baseUrlEnv: 'DISCOVER_API_BASE',
    defaultBaseUrl: '', // set once the Discover Developer Center app is registered
    endpoints: STANDARD_ENDPOINTS,
  },
]

export function listBankConnectors(): BankConnector[] {
  return BANK_CONNECTORS
}

export function getBankConnector(id: string | undefined | null): BankConnector | null {
  if (!id) return null
  return BANK_CONNECTORS.find(c => c.id === id) || null
}

/** Static {label,value} options for the institution picker (engine-safe). */
export function bankInstitutionOptions(): { label: string; value: string }[] {
  return BANK_CONNECTORS.map(c => ({ label: c.name, value: c.id }))
}

/** Resolve the base URL for a connector (env override → default). */
export function bankBaseUrl(c: BankConnector): string {
  return (process.env[c.baseUrlEnv] || c.defaultBaseUrl || '').replace(/\/+$/, '')
}

/** Resolve key/secret (connector-specific → generic placeholder fallback). */
export function bankCredentials(c: BankConnector): { key?: string; secret?: string } {
  return {
    key: process.env[c.keyEnv] || process.env[GENERIC_BANK_KEY_ENV] || undefined,
    secret: process.env[c.secretEnv] || process.env[GENERIC_BANK_SECRET_ENV] || undefined,
  }
}

/** Build a full URL, substituting {id} with an account id when present. */
export function bankEndpoint(c: BankConnector, path: string, accountId?: string): string {
  const base = bankBaseUrl(c)
  const p = path.replace('{id}', encodeURIComponent(String(accountId || '')))
  return base ? `${base}${p}` : p
}
