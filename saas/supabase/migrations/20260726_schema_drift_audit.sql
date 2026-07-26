-- saas/supabase/migrations/20260726_schema_drift_audit.sql
--
-- READ-ONLY. This file creates nothing, alters nothing, drops nothing. It is a single SELECT
-- that answers two questions the repository cannot answer on its own:
--
--   1. Which objects do the migrations in this repo CLAIM to create that are NOT in the
--      live database? (a migration that was never run)
--   2. Which tables does the CODE read or write that no migration in this repo creates at
--      all? (schema that exists only out-of-band, or not at all)
--
-- WHY IT EXISTS. A migration sitting in the repo is not evidence that it ran. Two were found
-- missing in one week. One of them, 20260718_global_ai_kill_switch.sql, meant system_status
-- did not exist in production — and because saas/proxy.ts fails closed when it cannot read
-- that table, every Vercel webhook to the supervisor returned 503 for weeks while the code
-- was blamed. The other, the audit-approval set, left a function-signature drift that took
-- several rounds to unpick.
--
-- HOW TO READ THE RESULT.
--   source = <filename>, present = false  ->  that migration has not been applied.
--   source = (no migration in repo), present = true   ->  the table exists, but its DDL is
--       nowhere in this repository. Nothing can rebuild it, and a buyer standing up their own
--       deployment of a portable that touches it has no schema to run.
--   source = (no migration in repo), present = false  ->  the code reads or writes a table
--       that does not exist. This is the failure mode that made /dashboard/assistant history
--       permanently empty: persistTurn swallows failed inserts, so it looked fine and never
--       saved anything.
-- Rows sort missing-first, so a clean top of the result means no drift.
--
-- WHY to_regclass AND pg_proc. Referencing a missing relation directly — even inside a
-- subquery — errors at PARSE time, so the obvious diagnostic fails on exactly the case it is
-- written to detect. to_regclass takes text and returns null instead. The function check goes
-- through pg_proc for the same reason.
--
-- WHERE TO RUN IT. The native Supabase SQL editor. The Hub Console SQL card goes through
-- hub_exec_sql, which wraps the query and rejects internal semicolons — if you use that,
-- delete the trailing semicolon. It is one statement either way.
--
-- Generated from the 75 migration files and the app/ + lib/ sources on main as of
-- 2026-07-26: 133 objects declared by migrations, 46 tables used by code with no
-- migration. Regenerate when migrations are added.
--
-- NOTE, found while generating this: supabase/migrations/20260616_pending_infrastructure_prs.sql
-- is a Markdown design document that was saved with a .sql extension. It contains no SQL. So
-- infrastructure_prs — the table the whole self-healing pipeline writes to, and the only table
-- readiness counts as proof that pipeline ran — has no DDL anywhere in this repository.

select
  v.source,
  v.object_name,
  v.kind,
  case
    when v.kind = 'table'
      then to_regclass(v.object_name) is not null
    else exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname || '.' || p.proname = v.object_name
    )
  end as present
from (values
  ('(no migration in repo)', 'public.admin_role_audit_logs', 'table'),
  ('(no migration in repo)', 'public.ai_business_sites', 'table'),
  ('(no migration in repo)', 'public.ai_local_items', 'table'),
  ('(no migration in repo)', 'public.assistant_conversations', 'table'),
  ('(no migration in repo)', 'public.assistant_messages', 'table'),
  ('(no migration in repo)', 'public.audit_findings', 'table'),
  ('(no migration in repo)', 'public.audit_logs', 'table'),
  ('(no migration in repo)', 'public.audit_readiness_runs', 'table'),
  ('(no migration in repo)', 'public.audit_runs', 'table'),
  ('(no migration in repo)', 'public.billing_customers', 'table'),
  ('(no migration in repo)', 'public.calendar_events', 'table'),
  ('(no migration in repo)', 'public.cos_campaign_clicks', 'table'),
  ('(no migration in repo)', 'public.cos_events', 'table'),
  ('(no migration in repo)', 'public.cos_mining_runs', 'table'),
  ('(no migration in repo)', 'public.cos_rules', 'table'),
  ('(no migration in repo)', 'public.cos_segments', 'table'),
  ('(no migration in repo)', 'public.cos_user_features', 'table'),
  ('(no migration in repo)', 'public.customers', 'table'),
  ('(no migration in repo)', 'public.hub_approval_policies', 'table'),
  ('(no migration in repo)', 'public.hub_audit_log', 'table'),
  ('(no migration in repo)', 'public.hub_console_settings', 'table'),
  ('(no migration in repo)', 'public.hub_vault_audit_log', 'table'),
  ('(no migration in repo)', 'public.hub_vault_secrets', 'table'),
  ('(no migration in repo)', 'public.hub_webhook_events', 'table'),
  ('(no migration in repo)', 'public.hub_webhooks', 'table'),
  ('(no migration in repo)', 'public.hub_workspace_users', 'table'),
  ('(no migration in repo)', 'public.marketing_campaigns', 'table'),
  ('(no migration in repo)', 'public.ms_campaigns', 'table'),
  ('(no migration in repo)', 'public.ms_drafts', 'table'),
  ('(no migration in repo)', 'public.ms_events', 'table'),
  ('(no migration in repo)', 'public.outreach_social_settings', 'table'),
  ('(no migration in repo)', 'public.partner_businesses', 'table'),
  ('(no migration in repo)', 'public.press_company_profile', 'table'),
  ('(no migration in repo)', 'public.profiles', 'table'),
  ('(no migration in repo)', 'public.projects', 'table'),
  ('(no migration in repo)', 'public.prospects', 'table'),
  ('(no migration in repo)', 'public.provider_connections', 'table'),
  ('(no migration in repo)', 'public.render_usage_ledger', 'table'),
  ('(no migration in repo)', 'public.stripe_processed_events', 'table'),
  ('(no migration in repo)', 'public.user_company_profile', 'table'),
  ('(no migration in repo)', 'public.user_provider_keys', 'table'),
  ('(no migration in repo)', 'public.user_settings', 'table'),
  ('(no migration in repo)', 'public.vault_audit', 'table'),
  ('(no migration in repo)', 'public.vault_items', 'table'),
  ('(no migration in repo)', 'public.vault_totp_secrets', 'table'),
  ('(no migration in repo)', 'public.vault_unlock_sessions', 'table'),
  ('20260512_create_core_schema.sql', 'public.increment_credits', 'function'),
  ('20260512_create_core_schema.sql', 'public.credits', 'table'),
  ('20260512_create_core_schema.sql', 'public.history', 'table'),
  ('20260512_create_core_schema.sql', 'public.users', 'table'),
  ('20260512_create_user_triggers.sql', 'public.handle_new_user', 'function'),
  ('20260512_credit_reset.sql', 'public.reset_credits', 'function'),
  ('20260512_rpc_reset_credits.sql', 'public.rpc_reset_credits', 'function'),
  ('20260513_create_add_credits_rpc.sql', 'public.add_credits', 'function'),
  ('20260513_create_behavioral_memory.sql', 'public.behavioral_memory', 'table'),
  ('20260513_create_brand_profiles_table.sql', 'public.brand_profiles', 'table'),
  ('20260513_create_deduct_credits_rpc.sql', 'public.deduct_credits', 'function'),
  ('20260513_create_review_response_memory.sql', 'public.review_response_patterns', 'table'),
  ('20260513_create_review_response_memory.sql', 'public.review_responses', 'table'),
  ('20260516_create_team_members.sql', 'public.can_add_member', 'function'),
  ('20260516_create_team_members.sql', 'public.get_seats_used', 'function'),
  ('20260516_create_team_members.sql', 'public.subscriptions', 'table'),
  ('20260516_create_team_members.sql', 'public.team_members', 'table'),
  ('20260517_tts_tables.sql', 'public.tts_cache', 'table'),
  ('20260517_tts_tables.sql', 'public.tts_usage', 'table'),
  ('20260519_create_reviews.sql', 'public.count_reviews_for_owner', 'function'),
  ('20260519_create_reviews.sql', 'public.reviews', 'table'),
  ('20260527_outreach_engine.sql', 'public.outreach_contacts', 'table'),
  ('20260527_outreach_engine.sql', 'public.outreach_discovery', 'table'),
  ('20260527_outreach_engine.sql', 'public.outreach_messages', 'table'),
  ('20260527_outreach_engine.sql', 'public.outreach_pipeline', 'table'),
  ('20260528_ai_outreach_adm.sql', 'public.is_signalboost_admin', 'function'),
  ('20260528_ai_outreach_adm.sql', 'public.touch_updated_at', 'function'),
  ('20260528_ai_outreach_adm.sql', 'public.admin_audit_log', 'table'),
  ('20260528_ai_outreach_adm.sql', 'public.ai_task_log', 'table'),
  ('20260528_ai_outreach_adm.sql', 'public.api_rate_limit_events', 'table'),
  ('20260528_ai_outreach_adm.sql', 'public.outreach_queue', 'table'),
  ('20260528_ai_outreach_adm.sql', 'public.outreach_sends', 'table'),
  ('20260528_ai_outreach_adm.sql', 'public.security_events', 'table'),
  ('20260528_ai_outreach_adm.sql', 'public.system_settings', 'table'),
  ('20260528_create_universal_data_connector.sql', 'public.categories', 'table'),
  ('20260528_create_universal_data_connector.sql', 'public.items', 'table'),
  ('20260528_create_universal_data_connector.sql', 'public.sources', 'table'),
  ('20260529_onboarding_flow_analytics.sql', 'public.set_user_profile_updated_at', 'function'),
  ('20260529_onboarding_flow_analytics.sql', 'public.error_logs', 'table'),
  ('20260529_onboarding_flow_analytics.sql', 'public.feedback', 'table'),
  ('20260529_onboarding_flow_analytics.sql', 'public.onboarding_analytics', 'table'),
  ('20260529_onboarding_flow_analytics.sql', 'public.user_profile', 'table'),
  ('20260529_outreach_send_limit_hardening.sql', 'public.enforce_outreach_send_safety', 'function'),
  ('20260606_video_caption_editor_pipeline.sql', 'public.set_video_job_updated_at', 'function'),
  ('20260606_video_caption_editor_pipeline.sql', 'public.accounts', 'table'),
  ('20260606_video_caption_editor_pipeline.sql', 'public.billing_overage_events', 'table'),
  ('20260606_video_caption_editor_pipeline.sql', 'public.video_jobs', 'table'),
  ('20260606_video_caption_editor_pipeline.sql', 'public.video_storage', 'table'),
  ('20260616_fix_hub_exec_sql_ddl.sql', 'public.hub_exec_sql', 'function'),
  ('20260621_user_audit_usage.sql', 'public.user_audit_usage', 'table'),
  ('20260622_audit_finding_state.sql', 'public.audit_finding_state', 'table'),
  ('20260623_cyber_dependency_scans.sql', 'public.cyber_dependency_scans', 'table'),
  ('20260624_cyber_monitors_alerts.sql', 'public.cyber_alerts', 'table'),
  ('20260624_cyber_monitors_alerts.sql', 'public.cyber_monitored_repositories', 'table'),
  ('20260625_remediation_requests.sql', 'public.remediation_requests', 'table'),
  ('20260628_cos_campaign_queue.sql', 'public.cos_campaign_queue', 'table'),
  ('20260628_cos_video_production_jobs.sql', 'public.cos_video_production_jobs', 'table'),
  ('20260628_cos_video_review_queue.sql', 'public.cos_video_review_queue', 'table'),
  ('20260628_resend_email_delivery.sql', 'public.email_delivery_events', 'table'),
  ('20260628_resend_email_delivery.sql', 'public.email_delivery_status', 'table'),
  ('20260629_integration_connections.sql', 'public.integration_connections', 'table'),
  ('20260706_press_campaigns.sql', 'public.set_press_campaigns_updated_at', 'function'),
  ('20260706_press_campaigns.sql', 'public.press_campaigns', 'table'),
  ('20260707_cos_decisions_governance.sql', 'public.cos_decisions', 'table'),
  ('20260707_cos_video_queue_lifecycle.sql', 'public.cos_video_escalation_tickets', 'table'),
  ('20260707_cos_video_queue_lifecycle.sql', 'public.cos_video_lifecycle_events', 'table'),
  ('20260707_social_outreach_campaigns.sql', 'public.outreach_social_campaign_posts', 'table'),
  ('20260707_social_outreach_campaigns.sql', 'public.outreach_social_campaigns', 'table'),
  ('20260707_social_outreach_campaigns.sql', 'public.outreach_social_tokens', 'table'),
  ('20260708_social_destinations.sql', 'public.outreach_social_destinations', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_approval_history', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_campaign_memory', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_confidence_history', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_intelligence_snapshots', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_memory_refresh_jobs', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_organization_aliases', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_organizations', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_repository_snapshots', 'table'),
  ('20260715_enterprise_memory_issue205.sql', 'public.enterprise_url_fingerprints', 'table'),
  ('20260716_provider_registry.sql', 'public.provider_registry', 'table'),
  ('20260716_supervisor_execution_history.sql', 'public.supervisor_audit_events', 'table'),
  ('20260716_supervisor_execution_history.sql', 'public.supervisor_evidence', 'table'),
  ('20260716_supervisor_execution_history.sql', 'public.supervisor_executions', 'table'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_acquire_lease', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_assert_fence', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_enqueue_work_item', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_heartbeat_instance', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_mark_instance_status', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_reconcile_expired_leases', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_release_lease', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_renew_lease', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_transition_work_item', 'function'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_coordination_events', 'table'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_instances', 'table'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_leases', 'table'),
  ('20260716_supervisor_federated_coordination.sql', 'public.supervisor_work_items', 'table'),
  ('20260716_user_provider_configs.sql', 'public.user_provider_configs', 'table'),
  ('20260717_github_universal_provider_runtime.sql', 'public.github_normalized_observations', 'table'),
  ('20260717_github_universal_provider_runtime.sql', 'public.github_schedule_state', 'table'),
  ('20260717_github_universal_provider_runtime.sql', 'public.github_webhook_deliveries', 'table'),
  ('20260717_github_universal_provider_runtime.sql', 'public.organization_provider_connections', 'table'),
  ('20260717_mission001_platform_self_diagnostics.sql', 'public.mission001_platform_health_snapshots', 'table'),
  ('20260717_vercel_deployment_health_intelligence.sql', 'public.vercel_deployment_health_runs', 'table'),
  ('20260717_vercel_observation_triggers.sql', 'public.vercel_observation_triggers', 'table'),
  ('20260718_github_readonly_observation_pipeline.sql', 'public.github_provider_audit_events', 'table'),
  ('20260718_github_readonly_observation_pipeline.sql', 'public.github_provider_evidence', 'table'),
  ('20260718_global_ai_kill_switch.sql', 'public.is_system_status_admin', 'function'),
  ('20260718_global_ai_kill_switch.sql', 'public.set_system_status_updated_at', 'function'),
  ('20260718_global_ai_kill_switch.sql', 'public.system_status', 'table'),
  ('20260718_supervisor_dispatch_ledger.sql', 'public.supervisor_dispatch_ledger', 'table'),
  ('20260719_audit_remediation_findings_approval.sql', 'public.approve_audit_run_remediation', 'function'),
  ('20260719_audit_run_global_approval.sql', 'public.audit_remediation_approvals', 'table'),
  ('20260719_enterprise_operations_snapshots.sql', 'public.enterprise_operations_snapshots', 'table'),
  ('20260720_audit_remediation_lifecycle_v2.sql', 'public.approve_audit_run_remediation_v2', 'function'),
  ('20260720_audit_remediation_lifecycle_v2.sql', 'public.finalize_audit_run_remediation_v2', 'function'),
  ('20260723_agent_workflow_durability.sql', 'public.agent_workflow_acquire_recovery_lock', 'function'),
  ('20260723_agent_workflow_durability.sql', 'public.agent_workflow_compare_and_set', 'function'),
  ('20260723_agent_workflow_durability.sql', 'public.agent_workflow_release_recovery_lock', 'function'),
  ('20260723_agent_workflow_durability.sql', 'public.agent_workflow_renew_recovery_lock', 'function'),
  ('20260723_agent_workflow_durability.sql', 'public.agent_workflow_recovery_locks', 'table'),
  ('20260723_agent_workflow_durability.sql', 'public.agent_workflows', 'table'),
  ('20260723_mission_002_durable_outbox.sql', 'public.mission_create_with_outbox', 'function'),
  ('20260723_mission_002_durable_outbox.sql', 'public.mission_mark_outbox_failure', 'function'),
  ('20260723_mission_002_durable_outbox.sql', 'public.mission_outbox_diagnostics', 'function'),
  ('20260723_mission_002_durable_outbox.sql', 'public.mission_event_inbox', 'table'),
  ('20260723_mission_002_durable_outbox.sql', 'public.mission_outbox', 'table'),
  ('20260723_mission_002_durable_outbox.sql', 'public.mission_records', 'table'),
  ('20260723_mission_002_manual_review_rpc_hardening.sql', 'public.mission_route_manual_review', 'function'),
  ('20260723_mission_002_manual_reviews.sql', 'public.mission_manual_reviews', 'table'),
  ('20260723_mission_002_worker_runtime.sql', 'public.mission_claim_outbox', 'function'),
  ('20260723_mission_002_worker_runtime.sql', 'public.mission_worker_leases', 'table'),
  ('20260725_agent_operation_activity.sql', 'public.agent_operation_activity', 'table'),
  ('20260725_portable_browser_activity.sql', 'public.portable_browser_activity', 'table')
) as v(source, object_name, kind)
order by present asc, v.source asc, v.object_name asc;
