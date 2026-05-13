create table if not exists credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  amount integer not null default 50,
  updated_at timestamp with time zone default now()
);

alter table credits enable row level security;

create policy "Users can view their own credits"
on credits for select
using (auth.uid() = user_id);

create policy "Users can update their own credits"
on credits for update
using (auth.uid() = user_id);
