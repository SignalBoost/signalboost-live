create table if not exists public.cos_university_credentials (
  id uuid primary key default gen_random_uuid(),
  credential_key text not null unique,
  agent_id text not null default 'cos',
  program_key text not null,
  program_level text not null check (program_level in ('undergraduate','masters','phd','professional_certificate')),
  title text not null,
  standing text not null check (standing in ('A','A+')),
  awarded_at timestamptz not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cos_university_credentials_agent_level_idx
  on public.cos_university_credentials (agent_id, program_level, awarded_at desc);

alter table public.cos_university_credentials enable row level security;
revoke all on table public.cos_university_credentials from anon, authenticated, service_role;
grant select, insert on table public.cos_university_credentials to service_role;

create or replace function public.cos_university_credentials_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'cos_university_credentials are immutable';
end;
$$;

revoke all on function public.cos_university_credentials_immutable_guard() from public;

-- Credentials are historical awards. Current competence is tracked by fresh assessments and may
-- weaken later without erasing the degree/certificate already earned.
drop trigger if exists cos_university_credentials_immutable on public.cos_university_credentials;
create trigger cos_university_credentials_immutable
before update or delete on public.cos_university_credentials
for each row execute function public.cos_university_credentials_immutable_guard();

comment on table public.cos_university_credentials is
  'Immutable host-issued degree/certificate awards. Current competence remains a separate continuously reassessed state.';
