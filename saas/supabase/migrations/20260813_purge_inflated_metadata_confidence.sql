-- saas/supabase/migrations/20260813_purge_inflated_metadata_confidence.sql
--
-- Removes learned rows whose stored confidence was INFLATED rather than measured. The previous
-- calibratedConfidence raised any metadata-class candidate matching two or more terms up to its
-- own admission floor plus a title boost, capped at 0.82 — which is why a robotics question
-- retrieved an obstetrics paper, an economics paper and a 2017 heat-transfer tutorial, all stamped
-- exactly 0.82. Honest grounding for a metadata blurb tops out well below that (substance is low
-- by construction, and the fixed pipeline caps the class at 0.70), so any metadata-class row at
-- or above 0.79 can only have been produced by the inflation. Rows below that are left alone:
-- their confidences may be mildly boosted but remain roughly honest, and re-learning under the
-- fixed pipeline will supersede them by content hash.

delete from public.cos_continuous_learning
where confidence >= 0.79
  and (
    license ilike '%metadata%'
    or license ilike '%discovery%'
    or length(summary) < 360
  );

-- Gaps those rows marked resolved must reopen, or the curriculum will not re-study them under the
-- honest calibration.
update public.cos_learning_gaps
set status = 'pending', resolved_at = null
where status = 'resolved';
