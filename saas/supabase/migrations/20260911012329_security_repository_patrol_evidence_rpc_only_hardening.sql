alter function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb)
  security definer;
alter function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb)
  set search_path = '';

revoke all on table public.security_repository_patrol_evidence from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.security_repository_patrol_evidence from service_role;
revoke usage, select, update
  on sequence public.security_repository_patrol_evidence_id_seq from service_role;
grant select on table public.security_repository_patrol_evidence to service_role;

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
