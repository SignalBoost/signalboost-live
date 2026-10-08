-- Durable, tenant-scoped Phase 1-5 observability. No anon/authenticated access.
-- Trusted backend service-role insertion only, after independent validation of source and scope.
create table if not exists public.lab_phase_observations (
  id bigint generated always as identity primary key,
  tenant_id text not null check (length(tenant_id) between 1 and 128),
  schema text not null default 'itmounts-lab-phase-observation-v1' check (schema = 'itmounts-lab-phase-observation-v1'),
  phase smallint not null check (phase between 1 and 5),
  signal text not null check (signal in (
    'factory_execution','evaluation_integrity','residency_disposition',
    'artifact_signature','artifact_identity','privacy_isolation',
    'tenant_isolation','byoi_adapter','portable_recovery',
    'budget_reservation','measured_reconciliation','refund_integrity',
    'partner_pilot','rights_review','security_review')),
  source text not null check (source in ('synthetic_ci','live_runtime','independent_review')),
  outcome text not null check (outcome in ('started','passed','failed','blocked')),
  exact_revision text not null check (exact_revision ~ '^[a-fA-F0-9]{7,64}$'),
  observed_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  independently_certified boolean not null default false check (independently_certified = false),
  production_authorized boolean not null default false check (production_authorized = false)
);
create index if not exists lab_phase_observations_scope_recent_idx
  on public.lab_phase_observations (tenant_id, exact_revision, observed_at desc);
alter table public.lab_phase_observations enable row level security;
revoke all on public.lab_phase_observations from anon, authenticated;
revoke all on sequence public.lab_phase_observations_id_seq from anon, authenticated;
comment on table public.lab_phase_observations is
  'Tenant-private metadata only; no documents, customer identities or certification authority. Service-role only. Signed actual evidence verified separately.';
