-- Mission 002 phase 5: durable, idempotent manual-review routing only.
create table if not exists public.mission_manual_reviews (
 review_id text primary key, mission_id text not null references public.mission_records(mission_id), mission_revision integer not null check (mission_revision > 0), decision_id text not null, decision_fingerprint text not null, plan_fingerprint text not null, binding_fingerprint text not null, status text not null check (status = 'routed'), title text not null, summary text not null, created_at timestamptz not null, routed_at timestamptz not null, schema_version text not null,
 unique (binding_fingerprint), unique (decision_id, mission_revision)
);
alter table public.mission_manual_reviews enable row level security;
revoke all on public.mission_manual_reviews from public, anon, authenticated;

create or replace function public.mission_route_manual_review(
 p_review_id text, p_mission_id text, p_mission_revision integer, p_decision_id text,
 p_decision_fingerprint text, p_plan_fingerprint text, p_binding_fingerprint text,
 p_title text, p_summary text, p_routed_at timestamptz, p_schema_version text,
 p_decision jsonb, p_binding jsonb
) returns public.mission_manual_reviews language plpgsql security definer set search_path=public as $$
declare current_mission public.mission_records; result public.mission_manual_reviews;
begin
 select * into current_mission from public.mission_records where mission_id=p_mission_id for update;
 if not found then raise exception 'stale_or_missing_mission'; end if;
 if current_mission.revision <> p_mission_revision then raise exception 'stale_mission_revision'; end if;
 if current_mission.status in ('COMPLETED','CANCELED','FAILED','BLOCKED') then raise exception 'mission_not_eligible'; end if;
 if p_decision->>'decisionId' <> p_decision_id or p_decision->>'missionId' <> p_mission_id or (p_decision->>'missionRevision')::integer <> p_mission_revision or p_decision->>'decisionFingerprint' <> p_decision_fingerprint or p_decision->>'planFingerprint' <> p_plan_fingerprint then raise exception 'decision_fingerprint_mismatch'; end if;
 if p_binding->>'decisionId' <> p_decision_id or p_binding->>'missionId' <> p_mission_id or (p_binding->>'missionRevision')::integer <> p_mission_revision or p_binding->>'decisionFingerprint' <> p_decision_fingerprint or p_binding->>'planFingerprint' <> p_plan_fingerprint or p_binding->>'bindingFingerprint' <> p_binding_fingerprint then raise exception 'binding_fingerprint_mismatch'; end if;
 if p_binding->>'policyOutcome' <> 'approved' then raise exception 'manual_review_not_approved'; end if;
 if (p_decision->>'expiresAt')::timestamptz <= now() then raise exception 'decision_expired'; end if;
 if (p_binding->>'expiresAt')::timestamptz <= now() then raise exception 'binding_expired'; end if;
 insert into public.mission_manual_reviews(review_id,mission_id,mission_revision,decision_id,decision_fingerprint,plan_fingerprint,binding_fingerprint,status,title,summary,created_at,routed_at,schema_version)
 values(p_review_id,p_mission_id,p_mission_revision,p_decision_id,p_decision_fingerprint,p_plan_fingerprint,p_binding_fingerprint,'routed',p_title,p_summary,p_routed_at,p_routed_at,p_schema_version)
 on conflict (binding_fingerprint) do nothing returning * into result;
 if found then return result; end if;
 select * into result from public.mission_manual_reviews where binding_fingerprint=p_binding_fingerprint;
 if found then return result; end if;
 select * into result from public.mission_manual_reviews where decision_id=p_decision_id and mission_revision=p_mission_revision;
 if found then return result; end if;
 raise exception 'manual_review_route_conflict';
end $$;
revoke all on function public.mission_route_manual_review(text,text,integer,text,text,text,text,text,text,timestamptz,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.mission_route_manual_review(text,text,integer,text,text,text,text,text,text,timestamptz,text,jsonb,jsonb) to service_role;
