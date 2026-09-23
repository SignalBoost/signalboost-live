-- Defense in depth for the append-only distillation asset vault.
-- The immutability trigger already rejects UPDATE/DELETE; remove those table privileges as well.

revoke update, delete, truncate, references, trigger
  on table public.cos_university_distillation_assets
  from service_role;

revoke update, delete, truncate, references, trigger
  on table public.cos_university_distillation_asset_sets
  from service_role;
