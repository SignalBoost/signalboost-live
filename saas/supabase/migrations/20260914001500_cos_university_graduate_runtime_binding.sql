-- Runtime binding for promoted COS University distilled graduates.
-- The model artifact is already promotion-gated before it reaches this table. This migration adds
-- only the serving profile needed to make that graduate callable by the existing COS control plane.
-- URLs and secrets never live in the database; runtime_profile resolves to host-controlled env.

alter table public.cos_university_graduate_model_registry
  add column if not exists runtime_profile text
  check (runtime_profile is null or runtime_profile in ('local_ai', 'graduate_ai'));

alter table public.cos_university_graduate_model_registry
  drop constraint if exists cos_university_graduate_model_registry_active_profile_check;

alter table public.cos_university_graduate_model_registry
  add constraint cos_university_graduate_model_registry_active_profile_check
  check (status <> 'active' or runtime_profile is not null);

comment on column public.cos_university_graduate_model_registry.runtime_profile is
  'Host-controlled serving profile. local_ai reuses the approved LOCAL_AI transport; graduate_ai uses the separately configured COS_GRADUATE_AI transport. No URL or secret is stored here.';
