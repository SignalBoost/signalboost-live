-- =========================================
-- SIGNALBOOST DEFAULT SEED DATA
-- =========================================

-- Starter tier defaults
insert into users (id, tier, auto_top_up)
select id, 'starter', false
from auth.users
on conflict (id) do nothing;

-- Starter credits
insert into credits (user_id, used, credit_limit)
select id, 0, 50
from auth.users
on conflict (user_id) do nothing;
