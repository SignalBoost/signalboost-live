-- Tighten the server-only residency-policy table after Supabase default table privileges.
-- service_role remains the only application runtime principal and receives DML only.
revoke all on table public.tenant_data_residency_policies from anon, authenticated, service_role;
grant select, insert, update, delete on table public.tenant_data_residency_policies to service_role;
