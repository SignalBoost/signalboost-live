-- Phase 3: single-use human approval consumption, after independent human authorization.
-- No approval creation RPC: only separately reviewed, privileged issuance may create records.
-- This is a replay barrier, NOT proof of human identity or permission to invoke a provider.
create table if not exists lab.provider_human_approvals (
 approval_id text primary key check (approval_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'),
 organization_id uuid not null references lab.organizations(id),
 permanent_artifact_id uuid not null,
 provider_id text not null,
 capability text not null check(capability in ('teacher.invoke','compute.execute','tool.invoke')),
 harness_run_id text not null,
 action_id text not null,
 secret_reference text not null,
 action_digest text not null check(action_digest ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 revoked_at timestamptz,
 consumed_at timestamptz,
 foreign key(permanent_artifact_id,organization_id) references lab.artifacts(permanent_artifact_id,organization_id),
 check(expires_at > approved_at),
 check(secret_reference ~ '^vault://[a-f0-9-]+/[A-Za-z0-9/_-]{1,200}$'),
 check(split_part(split_part(secret_reference,'vault://',2),'/',1)=organization_id::text),
 check(consumed_at is null or consumed_at >= approved_at),
 unique(organization_id,harness_run_id,action_id)
);
alter table lab.provider_human_approvals enable row level security;
revoke all on lab.provider_human_approvals from public,anon,authenticated,service_role;
create index if not exists lab_provider_human_approvals_scope_idx
 on lab.provider_human_approvals(organization_id,permanent_artifact_id,expires_at);

-- One database UPDATE is the sole consumption linearization point.
-- Runtime must separately verify authenticated approver, signed host/Referee authority,
-- current provider grant, and human-only approval before and after this call.
create or replace function lab.consume_provider_human_approval(
 p_approval_id text, p_organization_id uuid, p_artifact_id uuid, p_provider_id text,
 p_capability text, p_harness_run_id text, p_action_id text,
 p_secret_reference text, p_action_digest text
) returns boolean language plpgsql security definer set search_path=pg_catalog,lab as $$
declare did_consume boolean;
begin
 if session_user not in ('postgres','service_role')
    and coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','') <> 'service_role'
 then raise exception 'phase3_service_authority_denied'; end if;
 update lab.provider_human_approvals
 set consumed_at=clock_timestamp()
 where approval_id=p_approval_id and organization_id=p_organization_id
   and permanent_artifact_id=p_artifact_id and provider_id=p_provider_id
   and capability=p_capability and harness_run_id=p_harness_run_id
   and action_id=p_action_id and secret_reference=p_secret_reference
   and action_digest=p_action_digest and revoked_at is null
   and consumed_at is null and expires_at > clock_timestamp()
 returning true into did_consume;
 return coalesce(did_consume,false);
end $$;
revoke all on function lab.consume_provider_human_approval(text,uuid,uuid,text,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function lab.consume_provider_human_approval(text,uuid,uuid,text,text,text,text,text,text)
 to service_role;

-- The public RPC is an invoker proxy only; it has no power to mint human approval.
create or replace function public.itmounts_lab_consume_provider_human_approval(
 p_approval_id text, p_organization_id uuid, p_artifact_id uuid, p_provider_id text,
 p_capability text, p_harness_run_id text, p_action_id text,
 p_secret_reference text, p_action_digest text
) returns boolean language sql security invoker set search_path=pg_catalog,lab as $$
 select lab.consume_provider_human_approval(p_approval_id,p_organization_id,p_artifact_id,
   p_provider_id,p_capability,p_harness_run_id,p_action_id,p_secret_reference,p_action_digest)
$$;
revoke all on function public.itmounts_lab_consume_provider_human_approval(text,uuid,uuid,text,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.itmounts_lab_consume_provider_human_approval(text,uuid,uuid,text,text,text,text,text,text)
 to service_role;
