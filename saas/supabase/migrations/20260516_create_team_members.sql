-- Team members table
create table if not exists public.team_members (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  member_email text not null,
  member_id uuid references auth.users(id) on delete set null,
  role text default 'member' check (role in ('owner', 'admin', 'member')),
  status text default 'pending' check (status in ('pending', 'active', 'removed')),
  invited_at timestamp with time zone default now(),
  joined_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Subscriptions table to track plan + seats
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  plan text default 'free' check (plan in ('free', 'starter', 'pro', 'business')),
  seats_allowed integer default 1,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'active' check (status in ('active', 'trialing', 'cancelled', 'past_due')),
  trial_ends_at timestamp with time zone,
  current_period_ends_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.team_members enable row level security;
alter table public.subscriptions enable row level security;

-- RLS policies for team_members
create policy "Owner can manage their team"
  on public.team_members
  for all
  using (auth.uid() = owner_id);

create policy "Member can see their own membership"
  on public.team_members
  for select
  using (auth.uid() = member_id);

-- RLS policies for subscriptions
create policy "User can see own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

create policy "User can update own subscription"
  on public.subscriptions
  for update
  using (auth.uid() = user_id);

-- Auto-create free subscription on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, plan, seats_allowed)
  values (new.id, 'free', 1);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper function to get seats used
create or replace function public.get_seats_used(owner uuid)
returns integer as $$
  select count(*)::integer
  from public.team_members
  where owner_id = owner
  and status = 'active';
$$ language sql security definer;

-- Helper function to check if user can add member
create or replace function public.can_add_member(owner uuid)
returns boolean as $$
  select (
    select seats_allowed from public.subscriptions where user_id = owner
  ) > (
    select get_seats_used(owner)
  );
$$ language sql security definer;
