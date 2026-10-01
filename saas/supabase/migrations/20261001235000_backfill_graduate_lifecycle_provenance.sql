-- Seed immutable lifecycle provenance for graduates that existed before the lifecycle ledger.
-- Idempotent by registry/event/correlation identity and uses the canonical append RPC.

do $$
declare r record; v_evidence jsonb; v_hash text; v_time timestamptz;
begin
  for r in
    select id,candidate_id,trained_artifact_hash,promotion_evidence_hash,status,
           runtime_provider,runtime_model_id,runtime_health_evidence_hash,activation_evidence_hash,
           promoted_at,activated_at,created_at
      from public.cos_university_graduate_model_registry
     where status in ('pending_runtime','canary','active','quarantined','retired')
       and authority_expanded = false
  loop
    v_time := coalesce(r.promoted_at,r.created_at,now());
    if not exists(select 1 from public.cos_university_graduate_lifecycle_events where registry_id=r.id and event_type='graduated') then
      v_evidence := jsonb_build_object(
        'promotionEvidenceHash',r.promotion_evidence_hash,
        'source','registry_backfill',
        'authorityExpanded',false
      );
      v_hash := encode(digest(v_evidence::text,'sha256'),'hex');
      perform public.append_cos_graduate_lifecycle_event(r.id,r.candidate_id,r.trained_artifact_hash,'graduated',
        r.promotion_evidence_hash,v_hash,v_evidence,v_time);
    end if;
    if r.activated_at is not null and r.activation_evidence_hash is not null
       and not exists(select 1 from public.cos_university_graduate_lifecycle_events where registry_id=r.id and event_type='activated') then
      v_evidence := jsonb_build_object(
        'activationEvidenceHash',r.activation_evidence_hash,
        'runtimeHealthEvidenceHash',r.runtime_health_evidence_hash,
        'runtimeProvider',r.runtime_provider,
        'runtimeModelId',r.runtime_model_id,
        'source','registry_backfill',
        'authorityExpanded',false
      );
      v_hash := encode(digest(v_evidence::text,'sha256'),'hex');
      perform public.append_cos_graduate_lifecycle_event(r.id,r.candidate_id,r.trained_artifact_hash,'activated',
        r.activation_evidence_hash,v_hash,v_evidence,r.activated_at);
    end if;
  end loop;
end $$;
