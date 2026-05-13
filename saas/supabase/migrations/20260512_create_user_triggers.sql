-- =========================================
-- SIGNALBOOST USER TRIGGERS
-- =========================================

-- Trigger function: create credits + user row when new auth.users entry is added
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Insert into users table
  insert into users (id, tier, auto_top_up)
  values (new.id, 'starter', false)
  on conflict (id) do nothing;

  -- Insert into credits table
  insert into credits (user_id, used, credit_limit)
  values (new.id, 0, 50)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Trigger: fires after new user signup
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function handle_new_user();
