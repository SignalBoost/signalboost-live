create table if not exists behavioral_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  original_text text,
  user_edit text,

  -- extracted signals
  tone_shift text,
  formality_shift text,
  vocabulary_changes text[],
  structure_shift text,

  created_at timestamptz default now()
);

alter table behavioral_memory enable row level security;

create policy "Behavioral memory visible to owner"
  on behavioral_memory
  for select using (auth.uid() = user_id);

create policy "Behavioral memory insertable by owner"
  on behavioral_memory
  for insert with check (auth.uid() = user_id);
