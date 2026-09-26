-- Durable append-only 24-hour graduate routing leases.
create table if not exists public.cos_university_graduate_rotation_leases (
  id uuid primary key default gen_random_uuid(),
  lease_number bigint not null unique,
  candidate_id text not null,
  registry_id uuid not null references public.cos_university_graduate_model_registry(id),
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  previous_candidate_id text,
  previous_artifact_hash text check (previous_artifact_hash is null or previous_artifact_hash ~ '^[a-f0-9]{64}$'),
  rollback_artifact_ref text not null,
  runtime_health_evidence_hash text not null check (runtime_health_evidence_hash ~ '^[a-f0-9]{64}$'),
  controller_version text not null,
  commit_sha text,
  lease_started_at timestamptz not null,
  lease_expires_at timestamptz not null,
  authority_expanded boolean not null default false check (authority_expanded = false),
  created_at timestamptz not null default now(),
  check (lease_expires_at > lease_started_at)
);
create index if not exists cos_university_graduate_rotation_active_idx
  on public.cos_university_graduate_rotation_leases(lease_started_at desc, lease_expires_at desc);
alter table public.cos_university_graduate_rotation_leases enable row level security;
revoke all on public.cos_university_graduate_rotation_leases from anon, authenticated;
grant select, insert on public.cos_university_graduate_rotation_leases to service_role;
create or replace function public.prevent_cos_university_graduate_rotation_lease_mutation()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  raise exception 'cos_university_graduate_rotation_leases is append-only';
end;
$$;
revoke all on function public.prevent_cos_university_graduate_rotation_lease_mutation() from public, anon, authenticated;
grant execute on function public.prevent_cos_university_graduate_rotation_lease_mutation() to service_role;
drop trigger if exists cos_university_graduate_rotation_lease_immutable on public.cos_university_graduate_rotation_leases;
create trigger cos_university_graduate_rotation_lease_immutable
before update or delete on public.cos_university_graduate_rotation_leases
for each row execute function public.prevent_cos_university_graduate_rotation_lease_mutation();
