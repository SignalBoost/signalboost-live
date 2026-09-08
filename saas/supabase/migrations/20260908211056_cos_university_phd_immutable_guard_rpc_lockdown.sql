-- Mirror the Production hardening applied after the PhD runtime migration.
-- The immutable guard is a trigger-only SECURITY DEFINER function and must not be exposed as RPC.

revoke all on function public.cos_university_phd_immutable_guard() from public;
revoke execute on function public.cos_university_phd_immutable_guard() from anon, authenticated, service_role;
