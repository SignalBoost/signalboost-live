-- Lock Creative Memory to server/service-role access.
-- RLS already blocks client rows; this also prevents direct client invocation of the matcher RPC.

revoke all on table public.cos_creative_memory from public, anon, authenticated;
grant select, insert, update, delete on table public.cos_creative_memory to service_role;

revoke all on function public.cos_match_creative_memory(vector, integer, double precision, text, text)
  from public, anon, authenticated;
grant execute on function public.cos_match_creative_memory(vector, integer, double precision, text, text)
  to service_role;
