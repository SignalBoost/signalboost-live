-- Forward-only reconciliation for projects where 20260911004000 was applied
-- before the RPC-only hardening landed on main.
revoke insert on table public.security_repository_patrol_evidence from service_role;
revoke all on sequence public.security_repository_patrol_evidence_id_seq from service_role;
grant select on table public.security_repository_patrol_evidence to service_role;

alter function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb)
  security definer;
alter function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb)
  set search_path = '';

revoke all on function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb)
  to service_role;

create or replace function public.reject_security_repository_patrol_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'security_repository_patrol_evidence_is_append_only';
end;
$$;

drop trigger if exists security_repository_patrol_evidence_immutable
  on public.security_repository_patrol_evidence;
create trigger security_repository_patrol_evidence_immutable
before update or delete on public.security_repository_patrol_evidence
for each row execute function public.reject_security_repository_patrol_evidence_mutation();

revoke all on function public.reject_security_repository_patrol_evidence_mutation()
  from public, anon, authenticated;
