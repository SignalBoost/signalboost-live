create table if not exists review_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  platform text,              -- e.g. "google", "yelp"
  review_id text,             -- external review id if any
  review_rating integer,
  review_text text,

  ai_suggestion text,
  final_reply text,

  sentiment text,             -- e.g. "positive", "negative", "neutral"
  topic text,                 -- e.g. "delay", "staff", "price", "quality"

  response_style text,        -- e.g. "warm_apology", "firm_but_polite"
  created_at timestamptz default now()
);

create table if not exists review_response_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  situation_type text,        -- e.g. "negative_delay", "positive_general"
  preferred_tone text,        -- e.g. "warm", "calm", "direct"
  preferred_formality text,   -- e.g. "casual", "neutral", "formal"
  preferred_structure text,   -- e.g. "short_direct", "long_empathetic"
  example_phrases text[],     -- recurring phrases user tends to use

  last_updated_at timestamptz default now()
);

alter table review_responses enable row level security;
alter table review_response_patterns enable row level security;

create policy "Review responses visible to owner"
  on review_responses
  for select using (auth.uid() = user_id);

create policy "Review responses insertable by owner"
  on review_responses
  for insert with check (auth.uid() = user_id);

create policy "Review patterns visible to owner"
  on review_response_patterns
  for select using (auth.uid() = user_id);

create policy "Review patterns upsertable by owner"
  on review_response_patterns
  for insert with check (auth.uid() = user_id);

create policy "Review patterns updatable by owner"
  on review_response_patterns
  for update using (auth.uid() = user_id);
