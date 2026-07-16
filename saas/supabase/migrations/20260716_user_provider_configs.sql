-- Per-user integration settings for the universal integration engine.
-- Secrets are encrypted with AES-256-GCM before insert; service-role routes decrypt only in memory.
create extension if not exists pgcrypto;

create table if not exists public.user_provider_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_provider text not null,
  byok_enabled boolean not null default false,
  encrypted_keys jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_provider_configs_active_provider_idx on public.user_provider_configs(active_provider);

alter table public.user_provider_configs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_provider_configs'
      and policyname = 'Users can read their own provider config'
  ) then
    create policy "Users can read their own provider config"
      on public.user_provider_configs
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

comment on table public.user_provider_configs is 'User-selected active provider, BYOK state, and AES-256-GCM encrypted provider key envelopes for the universal integration engine.';
comment on column public.user_provider_configs.encrypted_keys is 'JSON object keyed by credential name. Values are encrypted envelopes: valueEncrypted, iv, tag, and optional last4. Never store plaintext secrets.';
