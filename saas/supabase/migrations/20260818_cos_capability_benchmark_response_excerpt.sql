-- Private diagnostic evidence for held-out benchmark failures. The parent table has RLS enabled
-- and all anon/authenticated access revoked; this field is intentionally not exposed by the API.
alter table public.cos_capability_benchmark_results
  add column if not exists response_excerpt text;
