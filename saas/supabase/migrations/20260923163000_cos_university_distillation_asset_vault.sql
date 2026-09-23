-- Durable iTMounts custody for reusable distillation material.
-- Provider/model identity is retained as provenance, while portable prompt/response identity is
-- deliberately independent of the student/base model so the University's paid learning material
-- can be reused when the serving/training model changes. No hidden chain-of-thought is stored.

create table if not exists public.cos_university_distillation_assets (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null unique check (asset_key ~ '^[a-f0-9]{64}$'),
  asset_set_key text not null check (asset_set_key ~ '^[a-f0-9]{64}$'),
  candidate_id text not null,
  run_id text,
  batch_key text,
  subject_id text,
  prompt_id text not null,
  prompt_set_hash text not null check (prompt_set_hash ~ '^[a-f0-9]{64}$'),
  source_item_hash text not null check (source_item_hash ~ '^[a-f0-9]{64}$'),
  portable_content_hash text not null check (portable_content_hash ~ '^[a-f0-9]{64}$'),
  prompt_text text not null,
  response_text text not null,
  training_text text not null,
  teacher_provider text not null,
  teacher_model_id text not null,
  teacher_model_revision text,
  source_ref text not null,
  training_rights text not null,
  model_neutral boolean not null default true check (model_neutral is true),
  contains_private_production_data boolean not null default false check (contains_private_production_data is false),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  check (length(btrim(prompt_text)) > 0),
  check (length(btrim(response_text)) > 0),
  check (length(btrim(training_text)) > 0),
  check (response_text !~* '<[[:space:]]*/?[[:space:]]*think([[:space:]>])')
);

create table if not exists public.cos_university_distillation_asset_sets (
  id uuid primary key default gen_random_uuid(),
  asset_set_key text not null unique check (asset_set_key ~ '^[a-f0-9]{64}$'),
  candidate_id text not null,
  run_id text,
  batch_key text,
  subject_id text,
  prompt_set_hash text not null check (prompt_set_hash ~ '^[a-f0-9]{64}$'),
  source_ref text not null,
  source_dataset_hash text not null check (source_dataset_hash ~ '^[a-f0-9]{64}$'),
  portable_manifest_hash text not null check (portable_manifest_hash ~ '^[a-f0-9]{64}$'),
  source_item_hashes text[] not null,
  portable_content_hashes text[] not null,
  item_count integer not null check (item_count between 1 and 5000),
  teacher_models jsonb not null check (jsonb_typeof(teacher_models) = 'array'),
  training_rights text not null,
  model_neutral boolean not null default true check (model_neutral is true),
  contains_private_production_data boolean not null default false check (contains_private_production_data is false),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  check (cardinality(source_item_hashes) = item_count),
  check (cardinality(portable_content_hashes) = item_count)
);

create index if not exists cos_university_distillation_assets_set_idx
  on public.cos_university_distillation_assets (asset_set_key, created_at asc);
create index if not exists cos_university_distillation_assets_portable_idx
  on public.cos_university_distillation_assets (portable_content_hash, created_at desc);
create index if not exists cos_university_distillation_assets_candidate_idx
  on public.cos_university_distillation_assets (candidate_id, created_at desc);
create index if not exists cos_university_distillation_asset_sets_candidate_idx
  on public.cos_university_distillation_asset_sets (candidate_id, created_at desc);
create index if not exists cos_university_distillation_asset_sets_portable_idx
  on public.cos_university_distillation_asset_sets (portable_manifest_hash, created_at desc);

alter table public.cos_university_distillation_assets enable row level security;
alter table public.cos_university_distillation_asset_sets enable row level security;

revoke all on table public.cos_university_distillation_assets from public, anon, authenticated;
revoke all on table public.cos_university_distillation_asset_sets from public, anon, authenticated;
grant select, insert on table public.cos_university_distillation_assets to service_role;
grant select, insert on table public.cos_university_distillation_asset_sets to service_role;

create or replace function public.reject_cos_university_distillation_asset_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'cos_university_distillation_asset_immutable';
end;
$$;

revoke all on function public.reject_cos_university_distillation_asset_mutation() from public, anon, authenticated;

drop trigger if exists cos_university_distillation_assets_immutable on public.cos_university_distillation_assets;
create trigger cos_university_distillation_assets_immutable
before update or delete on public.cos_university_distillation_assets
for each row execute function public.reject_cos_university_distillation_asset_mutation();

drop trigger if exists cos_university_distillation_asset_sets_immutable on public.cos_university_distillation_asset_sets;
create trigger cos_university_distillation_asset_sets_immutable
before update or delete on public.cos_university_distillation_asset_sets
for each row execute function public.reject_cos_university_distillation_asset_mutation();

comment on table public.cos_university_distillation_assets is
  'Append-only iTMounts-controlled copy of reusable distillation prompt/response material. Provider/model fields are provenance; portable_content_hash intentionally excludes model identity. Technical custody does not alter third-party license or provider terms.';
comment on table public.cos_university_distillation_asset_sets is
  'Append-only completion seals for durable model-neutral distillation asset sets. A set exists only after every expected training-material row has been persisted.';
comment on column public.cos_university_distillation_assets.training_text is
  'Exact text whose source_item_hash was used by the originating dataset. Preserved so historical train/holdout manifests remain reconstructable.';
comment on column public.cos_university_distillation_assets.portable_content_hash is
  'SHA-256 identity of prompt+response only; intentionally independent of teacher/student/base model and provider.';
