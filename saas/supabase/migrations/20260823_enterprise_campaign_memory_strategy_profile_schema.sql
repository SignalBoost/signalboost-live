-- Repair production schema drift discovered while wiring current strategy-profile generation.
-- Repository code and the canonical 20260715 Enterprise Memory migration use performance_data and
-- updated_at, while the live table retained the older performance column and had no updated_at.
-- Add only the missing backward-compatible columns and preserve any legacy performance payload.

alter table public.enterprise_campaign_memory
  add column if not exists performance_data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.enterprise_campaign_memory
set performance_data = performance
where performance_data = '{}'::jsonb
  and performance is not null
  and performance <> '{}'::jsonb;

create or replace function public.touch_enterprise_campaign_memory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists enterprise_campaign_memory_touch_updated_at on public.enterprise_campaign_memory;
create trigger enterprise_campaign_memory_touch_updated_at
before update on public.enterprise_campaign_memory
for each row execute function public.touch_enterprise_campaign_memory_updated_at();
