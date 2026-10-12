-- Customer-set external GPU hourly spending cap, not a vendor price.
-- A hard upper bound prevents malformed financial values; actual costs are provider-sourced
-- and planned jobs still fail closed against the customer's total approved budget.
alter table lab.customer_training_runs drop constraint if exists customer_training_runs_max_hourly_usd_check;
alter table lab.customer_training_runs add constraint customer_training_runs_max_hourly_usd_check
  check (max_hourly_usd > 0 and max_hourly_usd <= 1000);
