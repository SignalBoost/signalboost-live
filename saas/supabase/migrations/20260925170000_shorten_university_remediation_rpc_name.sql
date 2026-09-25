-- PostgreSQL identifiers are limited to 63 bytes. The original remediation RPC name was
-- silently truncated, so PostgREST could not resolve the application call. Rename the existing
-- function to an explicit stable identifier within the PostgreSQL limit.
alter function public.authorize_next_cos_university_mass_distillation_remediation_cam()
  rename to authorize_next_cos_university_remediation_campaign;

revoke all on function public.authorize_next_cos_university_remediation_campaign()
  from public, anon, authenticated;
grant execute on function public.authorize_next_cos_university_remediation_campaign()
  to service_role;

notify pgrst, 'reload schema';
