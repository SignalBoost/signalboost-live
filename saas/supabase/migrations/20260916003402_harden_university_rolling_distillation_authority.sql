-- Forward-only repair for Production databases that already recorded
-- 20260915234000 before the rolling-authority hardening landed.
--
-- The wrapper must retain owner privileges after direct service-role execution of the legacy
-- primitive is removed. Its EXECUTE grant remains service-role-only and its body uses an empty
-- search_path plus fully-qualified objects.
alter function public.authorize_next_cos_university_mass_distillation_campaign()
  security definer;

revoke execute on function public.authorize_cos_university_mass_distillation_campaign(text[],numeric,text,interval)
  from service_role;

notify pgrst, 'reload schema';
