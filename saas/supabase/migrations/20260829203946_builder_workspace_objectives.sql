alter table public.builder_workspaces
  add column if not exists objective text;

alter table public.builder_workspaces
  drop constraint if exists builder_workspaces_objective_size_check;

alter table public.builder_workspaces
  add constraint builder_workspaces_objective_size_check
  check (objective is null or char_length(objective) <= 500);

comment on column public.builder_workspaces.objective is
  'Latest bounded coding objective, shown only to the authenticated workspace owner.';
