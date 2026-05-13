-- =========================================
-- SIGNALBOOST CREDIT RESET FUNCTION
-- =========================================

create or replace function reset_credits(
  target_user_id uuid,
  new_limit integer
)
returns void
as $$
begin
  -- Update credit limit safely
  update credits
  set credit_limit = new_limit,
      used = 0,
      updated_at = now()
  where credits.user_id = target_user_id;

  -- Optional: also update tier in users table
  update users
  set tier = case
    when new_limit >= 200 then 'pro'
    when new_limit >= 100 then 'growth'
    else 'starter'
  end
  where users.id = target_user_id;
end;
$$ language plpgsql;
