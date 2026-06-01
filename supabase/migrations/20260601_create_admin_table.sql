create extension if not exists pgcrypto;

create table if not exists public.admin (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin' check (role = 'admin'),
  is_primary boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create unique index if not exists admin_one_primary_idx on public.admin (is_primary) where is_primary = true;
create index if not exists admin_email_idx on public.admin (lower(email));

alter table public.admin enable row level security;

-- Browser clients receive admin status only through server routes that query this table.
-- No direct client-side RLS policies are created, so anon/authenticated clients cannot
-- grant themselves admin access or mutate this table outside the protected API.

drop trigger if exists protect_primary_admin on public.admin;

insert into public.admin (email, role, is_primary)
values ('LUIS_EMAIL_HERE', 'admin', true)
on conflict (email) do update
set role = 'admin', is_primary = true;

create or replace function public.prevent_primary_admin_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.is_primary = true then
    raise exception 'Primary admin cannot be removed';
  end if;

  if tg_op = 'UPDATE' and old.is_primary = true then
    raise exception 'Primary admin cannot be changed';
  end if;

  if tg_op = 'UPDATE' and old.role is distinct from new.role then
    raise exception 'Admin role changes are not allowed';
  end if;

  if tg_op = 'UPDATE' and old.is_primary is distinct from new.is_primary then
    raise exception 'Primary admin flag changes are not allowed';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger protect_primary_admin
before update or delete on public.admin
for each row execute function public.prevent_primary_admin_mutation();
