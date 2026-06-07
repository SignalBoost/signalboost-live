create extension if not exists "uuid-ossp";

create type user_role as enum ('owner', 'admin', 'editor', 'viewer');
create type plan_key as enum ('starter', 'growth');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type content_status as enum ('draft', 'review', 'published', 'archived');
create type match_status as enum ('draft', 'scheduled', 'live', 'final', 'postponed');

create table users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  password_hash text not null,
  name text,
  role user_role not null default 'owner',
  plan plan_key not null default 'starter',
  subscription_status subscription_status not null default 'trialing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references users(id) on delete cascade,
  name text not null,
  slug text not null,
  city text,
  division text,
  logo_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, slug)
);

create table matches (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references users(id) on delete cascade,
  home_team_id uuid references teams(id) on delete set null,
  away_team_id uuid references teams(id) on delete set null,
  starts_at timestamptz not null,
  venue text,
  status match_status not null default 'scheduled',
  home_score integer,
  away_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rankings (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references users(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  season text not null,
  position integer not null,
  points integer not null default 0,
  movement integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, season, team_id)
);

create table content_items (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references users(id) on delete cascade,
  title text not null,
  slug text not null,
  body text,
  type text not null default 'article',
  channel text not null default 'web',
  status content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, slug)
);

create table payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'mercadopago')),
  provider_reference text,
  plan plan_key not null,
  status text not null,
  amount_cents integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teams_created_by_idx on teams(created_by);
create index matches_created_by_starts_at_idx on matches(created_by, starts_at);
create index rankings_created_by_season_idx on rankings(created_by, season);
create index content_created_by_status_idx on content_items(created_by, status);
create index payments_user_id_idx on payments(user_id);
