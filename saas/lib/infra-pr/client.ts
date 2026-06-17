// lib/infra-pr/client.ts
// Self-contained service-role client for the infrastructure PR queue.
// Service role bypasses RLS; never import this into client components.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function infraAdminClient(): { ok: boolean; client?: SupabaseClient; error?: string } {
  if (cached) return { ok: true, client: cached };

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !key) {
    return {
      ok: false,
      error:
        'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (SaaS canonical project)',
    };
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { ok: true, client: cached };
}
