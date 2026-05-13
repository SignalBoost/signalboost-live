create table if not exists brand_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Core brand identity
  brand_name text,
  brand_tagline text,
  brand_tone text,              -- e.g. "warm, premium, friendly"
  formality_level text,         -- e.g. "formal", "neutral", "casual"
  primary_audience text,        -- e.g. "local families", "B2B SaaS founders"
  brand_personality text,       -- freeform description

  -- Cultural + language preferences
  primary_language text,        -- e.g. "en", "pt-BR"
  secondary_languages text[],   -- e.g. ['es', 'pt-BR']
  cultural_notes text,          -- e.g. "Brazilian-American, values warmth + speed"

  -- Visual preferences (for later use)
  preferred_colors text[],
  layout_style text,            -- e.g. "clean", "dense", "bold", "minimal"
  visual_notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index brand_profiles_user_id_idx
  on brand_profiles(user_id);

alter table brand_profiles
  enable row level security;

create policy "Brand profile is only visible to owner"
  on brand_profiles
  for select using (auth.uid() = user_id);

create policy "Brand profile is only updatable by owner"
  on brand_profiles
  for update using (auth.uid() = user_id);

create policy "Brand profile is only insertable by owner"
  on brand_profiles
  for insert with check (auth.uid() = user_id);
