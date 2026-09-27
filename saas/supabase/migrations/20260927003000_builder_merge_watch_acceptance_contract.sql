alter table public.builder_merge_watches
  add column if not exists acceptance_url text,
  add column if not exists acceptance_expected_text text;

alter table public.builder_merge_watches
  drop constraint if exists builder_merge_watches_acceptance_url_length;
alter table public.builder_merge_watches
  add constraint builder_merge_watches_acceptance_url_length
  check (acceptance_url is null or length(acceptance_url) between 1 and 1000);

alter table public.builder_merge_watches
  drop constraint if exists builder_merge_watches_acceptance_expected_text_length;
alter table public.builder_merge_watches
  add constraint builder_merge_watches_acceptance_expected_text_length
  check (acceptance_expected_text is null or length(acceptance_expected_text) between 1 and 500);
