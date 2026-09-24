-- Immutable evidence registry for Working-COS direct-distillation candidates.
-- Registration proves a balanced portable education bundle was bound to an exact current COS
-- runtime identity and explicit rollback target. It grants no training, spend, model mutation,
-- Production traffic, authority expansion, or University graduation.

create table if not exists public.cos_working_distillation_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique check (candidate_key ~ '^[a-f0-9]{64}$'),
  candidate_id text not null,
  profile text not null,
  bundle_key text not null check (bundle_key ~ '^[a-f0-9]{64}$'),
  portable_manifest_hash text not null check (portable_manifest_hash ~ '^[a-f0-9]{64}$'),
  item_count integer not null check (item_count >= 20),
  subject_count integer not null check (subject_count >= 2),
  subject_ids text[] not null,
  asset_set_keys text[] not null,
  target_base_model text not null,
  configured_runtime_model text not null,
  baseline_identity text not null,
  rollback_artifact_ref text not null,
  status text not null default 'registered' check (status in ('registered','training_pending','training_dispatched','trained','quarantined','retired')),
  next_gate text not null default 'bounded_training_dispatch',
  automatic_training_authorized boolean not null default false check (automatic_training_authorized is false),
  automatic_activation_authorized boolean not null default false check (automatic_activation_authorized is false),
  production_traffic_authorized boolean not null default false check (production_traffic_authorized is false),
  university_graduation_claimed boolean not null default false check (university_graduation_claimed is false),
  authority_expanded boolean not null default false check (authority_expanded is false),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  check (cardinality(subject_ids) = subject_count),
  check (cardinality(asset_set_keys) >= subject_count)
);

create index if not exists cos_working_distillation_candidates_created_idx
  on public.cos_working_distillation_candidates (created_at desc);
create index if not exists cos_working_distillation_candidates_status_idx
  on public.cos_working_distillation_candidates (status, created_at desc);

alter table public.cos_working_distillation_candidates enable row level security;

revoke all on table public.cos_working_distillation_candidates from public, anon, authenticated;
grant select, insert on table public.cos_working_distillation_candidates to service_role;

drop trigger if exists cos_working_distillation_candidates_immutable on public.cos_working_distillation_candidates;
create trigger cos_working_distillation_candidates_immutable
before update or delete on public.cos_working_distillation_candidates
for each row execute function public.reject_cos_university_distillation_asset_mutation();

comment on table public.cos_working_distillation_candidates is
  'Append-only evidence that a balanced model-neutral University education bundle was bound to the exact current COS runtime and rollback identity. Registration alone never authorizes training, spend, activation, traffic, or graduation.';
