-- Tenant-private advisory alerts; durable, idempotent, and never authorization for repairs.
create table if not exists public.lab_phase_health_alerts (
 tenant_id text not null check (length(tenant_id) between 1 and 128),
 exact_revision text not null check (exact_revision ~ '^[a-fA-F0-9]{7,64}$'),
 phase smallint not null check (phase between 1 and 5),
 signal text not null check (signal in (
 'factory_execution','evaluation_integrity','residency_disposition',
 'artifact_signature','artifact_identity','privacy_isolation',
 'tenant_isolation','byoi_adapter','portable_recovery',
 'budget_reservation','measured_reconciliation','refund_integrity',
 'partner_pilot','rights_review','security_review')),
 code text not null check (code in ('lab_phase_signal_unknown','lab_phase_signal_stale','lab_phase_signal_blocked')),
 severity text not null check (severity in ('warning','high')),
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 occurrence_count integer not null default 1 check(occurrence_count >= 1),
 primary key (tenant_id,exact_revision,phase,signal)
);
alter table public.lab_phase_health_alerts enable row level security;
revoke all on public.lab_phase_health_alerts from anon,authenticated;
comment on table public.lab_phase_health_alerts is 'Service-only tenant-scoped monitoring outbox; not a Supervisor repair authorization or delivery receipt.';
