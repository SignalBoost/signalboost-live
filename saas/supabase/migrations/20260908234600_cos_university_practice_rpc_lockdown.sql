-- The canonical cognitive practice recorder is a SECURITY DEFINER host mutation seam.
-- University practice now also uses it to protect study-plan state, so browser roles must not execute it.

revoke all on function public.cos_record_cognitive_practice_result(uuid, boolean, double precision, text, jsonb) from public;
revoke all on function public.cos_record_cognitive_practice_result(uuid, boolean, double precision, text, jsonb) from anon, authenticated;
grant execute on function public.cos_record_cognitive_practice_result(uuid, boolean, double precision, text, jsonb) to service_role;

comment on function public.cos_record_cognitive_practice_result(uuid, boolean, double precision, text, jsonb) is
  'Service-role-only canonical cognitive practice recorder. University-origin rows are transactionally fenced against exact accepted-study state; browser roles cannot invoke this SECURITY DEFINER mutation seam.';
