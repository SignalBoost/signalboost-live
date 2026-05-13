-- =========================================
-- SIGNALBOOST RPC: RESET CREDITS
-- =========================================

-- Expose reset_credits as an RPC function
create or replace function rpc_reset_credits(
  target_user_id uuid,
  new_limit integer
)
returns void
language sql
security definer
as $$
  select reset_credits(target_user_id, new_limit);
$$;

-- Grant execute permission to authenticated users
grant execute on function rpc_reset_credits(uuid, integer) to authenticated;
