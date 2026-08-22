alter table public.cos_turn_experience
  add column if not exists confidence double precision
    check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table public.cos_turn_experience
  add column if not exists confidence_threshold double precision;

alter table public.cos_turn_experience
  add column if not exists draft_survived_unrepaired boolean;

create index if not exists cos_turn_experience_confidence_idx
  on public.cos_turn_experience(created_at desc)
  where confidence is not null;

comment on column public.cos_turn_experience.confidence is
  'COS confidence prediction, stored beside outcomes so the answer gate can be calibrated.';
comment on column public.cos_turn_experience.draft_survived_unrepaired is
  'False when a quality repair ran; skipped repairs do not count as failures.';
