-- A delegated Builder execution must never be moved to another customer task.
-- Reuse the existing builder_jobs parent link and its ownership validator.
CREATE OR REPLACE FUNCTION public.protect_builder_customer_task_parent_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (OLD.metadata->>'customerTaskId') IS DISTINCT FROM
     (NEW.metadata->>'customerTaskId') THEN
    RAISE EXCEPTION 'builder_customer_task_parent_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_builder_customer_task_parent_identity ON public.builder_jobs;
CREATE TRIGGER protect_builder_customer_task_parent_identity
  BEFORE UPDATE OF metadata ON public.builder_jobs
  FOR EACH ROW EXECUTE FUNCTION public.protect_builder_customer_task_parent_identity();
REVOKE ALL ON FUNCTION public.protect_builder_customer_task_parent_identity()
  FROM PUBLIC, anon, authenticated;
