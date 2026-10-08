-- Phase 3: reject approval redemption after the approving human loses tenant authority.
-- Separate additive migration so historic migrations remain immutable.
create or replace function lab.consume_provider_human_approval(
 p_approval_id text,p_organization_id uuid,p_artifact_id uuid,p_provider_id text,
 p_capability text,p_harness_run_id text,p_action_id text,
 p_secret_reference text,p_action_digest text
) returns boolean language plpgsql security definer set search_path=pg_catalog,lab as $$
declare did_consume boolean;
begin
 if session_user not in ('postgres','service_role')
    and coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','') <> 'service_role'
 then raise exception 'phase3_service_authority_denied'; end if;
 update lab.provider_human_approvals a
 set consumed_at=clock_timestamp()
 where a.approval_id=p_approval_id and a.organization_id=p_organization_id
   and a.permanent_artifact_id=p_artifact_id and a.provider_id=p_provider_id
   and a.capability=p_capability and a.harness_run_id=p_harness_run_id
   and a.action_id=p_action_id and a.secret_reference=p_secret_reference
   and a.action_digest=p_action_digest and a.revoked_at is null
   and a.consumed_at is null and a.expires_at > clock_timestamp()
   and exists (
     select 1 from lab.organization_members m
     where m.organization_id=a.organization_id and m.user_id=a.approved_by
       and m.status='active' and m.role in ('owner','admin')
   )
 returning true into did_consume;
 return coalesce(did_consume,false);
end $$;
revoke all on function lab.consume_provider_human_approval(text,uuid,uuid,text,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function lab.consume_provider_human_approval(text,uuid,uuid,text,text,text,text,text,text)
 to service_role;
