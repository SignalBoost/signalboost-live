-- Add a non-secret evaluator profile selector to held-out capability cases.
-- Hidden prompts and expected terms remain service-role-only data and are never committed here.
alter table public.cos_capability_benchmark_cases
  add column if not exists evaluation_profile text;

create index if not exists cos_capability_benchmark_cases_profile_idx
  on public.cos_capability_benchmark_cases(evaluation_profile)
  where evaluation_profile is not null;
