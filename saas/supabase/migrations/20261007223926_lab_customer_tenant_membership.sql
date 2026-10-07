-- Explicit Lab customer membership. Do not infer Lab tenancy from unrelated SaaS teams.
create table lab.organization_members (
  organization_id uuid not null references lab.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
alter table lab.organization_members enable row level security;
revoke all on lab.organization_members from public,anon,authenticated,service_role;

create or replace function lab.resolve_user_organization(p_user_id uuid,p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,lab as $$
declare m lab.organization_members%rowtype;
declare jwt_role text := coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','');
begin
 if session_user not in ('postgres','service_role') and jwt_role <> 'service_role' then raise exception 'lab_service_authority_denied'; end if;
 select * into m from lab.organization_members
 where user_id=p_user_id and organization_id=p_organization_id and status='active';
 if not found then return null; end if;
 return jsonb_build_object('organization_id',m.organization_id,'user_id',m.user_id,'role',m.role,'status',m.status);
end $$;
revoke all on function lab.resolve_user_organization(uuid,uuid) from public,anon,authenticated;
grant execute on function lab.resolve_user_organization(uuid,uuid) to service_role;

create or replace function public.itmounts_lab_resolve_user_organization(p_user_id uuid,p_organization_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,lab as $$
 select lab.resolve_user_organization(p_user_id,p_organization_id)
$$;
revoke all on function public.itmounts_lab_resolve_user_organization(uuid,uuid) from public,anon,authenticated;
grant execute on function public.itmounts_lab_resolve_user_organization(uuid,uuid) to service_role;
