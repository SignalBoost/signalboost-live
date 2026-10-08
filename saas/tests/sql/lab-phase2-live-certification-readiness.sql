-- Phase 2 LIVE readiness (read-only). Run against the target environment before
-- any certification claim. Counts are evidence of prerequisites, not proof of
-- KMS signing, Harness authorization, tenant isolation or independent review.
-- No synthetic organization/owner/artifact rows or fabricated certificates.
with checks as (
  select
    (select count(*) from lab.organizations) as organizations,
    (select count(*) from lab.universities) as universities,
    (select count(*) from lab.projects) as projects,
    (select count(*) from lab.experiments) as experiments,
    (select count(*) from lab.cohorts) as cohorts,
    (select count(*) from lab.artifacts) as artifacts,
    (select count(*) from public.cos_university_artifact_birth_certificates where issuance_kind = 'native_birth') as native_births,
    (select count(*) from public.cos_university_signed_birth_envelopes) as signed_envelopes,
    (select count(*) from public.cos_university_artifact_birth_certificates b
       join lab.artifacts a on a.permanent_artifact_id = b.permanent_artifact_id
      where b.issuance_kind = 'native_birth') as native_births_with_canonical_owner
)
select *,
       (organizations > 0 and universities > 0 and projects > 0
         and experiments > 0 and cohorts > 0 and artifacts > 0
         and native_births_with_canonical_owner > 0) as ownership_prerequisites_present,
       (signed_envelopes > 0) as persisted_signature_evidence_present,
       false as live_kms_harness_integrity_independently_verified
from checks;
