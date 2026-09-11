-- Version the semantic representation of retained COS learning so historical rows can be
-- distilled in bounded, restart-safe batches. Raw evidence/provenance remain untouched.

alter table public.cos_continuous_learning
  add column if not exists semantic_distillation_version text,
  add column if not exists semantic_distilled_at timestamptz;

comment on column public.cos_continuous_learning.semantic_distillation_version is
  'Version of deterministic semantic distillation applied to retained summary/facts; NULL means pending.';

comment on column public.cos_continuous_learning.semantic_distilled_at is
  'Timestamp when the retained semantic representation was last evaluated/distilled. Does not alter source evidence provenance.';

create index if not exists idx_cos_continuous_learning_semantic_distillation_pending
  on public.cos_continuous_learning (semantic_distillation_version, observed_at);
