-- Main-branch Builder repairs stay paused until live production acceptance is recorded.
-- The durable TypeScript reconciler is the only path that may terminalize after acceptance.
create or replace function public.finish_builder_job_slice(
  p_job_id uuid,
  p_user_id uuid,
  p_generation integer,
  p_status text,
  p_reply text,
  p_result jsonb,
  p_error text default null
)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_job public.builder_jobs%rowtype;
  v_result jsonb := coalesce(p_result, '{}'::jsonb);
  v_status text := p_status;
  v_error text := nullif(p_error, '');
  v_platform_repair boolean := false;
  v_pr integer := null;
  v_sha text := null;
begin
  if p_status not in ('succeeded', 'failed') then raise exception 'builder_job_invalid_terminal_status'; end if;
  select * into v_job from public.builder_jobs
   where id=p_job_id and user_id=p_user_id and status='running' and claim_generation=p_generation for update;
  if not found then return; end if;

  v_platform_repair := coalesce(v_job.metadata->>'platformRepair','false')='true';
  if coalesce(v_result->>'pull_request_number','') ~ '^[1-9][0-9]*$' then v_pr := (v_result->>'pull_request_number')::integer; end if;
  if coalesce(v_result->>'merge_commit_sha','') ~ '^[0-9a-fA-F]{40}$' then v_sha := lower(v_result->>'merge_commit_sha'); end if;

  if v_platform_repair and p_status='succeeded' then
    if coalesce(v_result->>'merge_taken','false')='true' and v_pr is not null and v_sha is not null and coalesce(v_result->>'branch','main')='main' then
      update public.builder_jobs set
        status='paused', checkpoint=null, error=null, updated_at=now(),
        result=v_result || jsonb_build_object(
          'status','paused',
          'repository_merge_pending',true,
          'production_proof_pending',true,
          'production_acceptance_required',true,
          'production_acceptance_passed',false,
          'merge_commit_sha',v_sha
        )
      where id=p_job_id and user_id=p_user_id and status='running' and claim_generation=p_generation;
      update public.assistant_messages set
        content=left(format('Builder merged PR #%s as %s, but the job is not complete. Live Production acceptance is pending.\n\n%s',v_pr,v_sha,p_reply),16000),
        provenance=jsonb_build_object('schema','signalboost-builder-job-v1','jobId',p_job_id,'workspaceId',v_job.workspace_id,'status','paused','repositoryMergePending',true,'pullRequestNumber',v_pr)
      where id=v_job.history_message_id and user_id=p_user_id;
      return;
    elsif coalesce(v_result->>'merge_taken','false')='true' and v_pr is not null and v_sha is not null then
      null;
    elsif coalesce(v_result->>'repository_write_stage','')='pr_created' and coalesce(v_result->>'merge_allowed','false')='true' and v_pr is not null then
      update public.builder_jobs set
        status='paused', checkpoint=null, error=null, updated_at=now(),
        result=v_result || jsonb_build_object('status','paused','repository_merge_pending',true,'merge_taken',false)
      where id=p_job_id and user_id=p_user_id and status='running' and claim_generation=p_generation;
      return;
    else
      v_status := 'failed';
      v_error := 'builder_repository_merge_incomplete';
      v_result := v_result || jsonb_build_object('status','failed','repository_merge_pending',false,'error',v_error);
    end if;
  end if;

  update public.builder_jobs set status=v_status,checkpoint=null,result=v_result,error=v_error,finished_at=now(),updated_at=now()
   where id=p_job_id and user_id=p_user_id and status='running' and claim_generation=p_generation;
  update public.assistant_messages set content=left(p_reply,16000),
    provenance=jsonb_build_object('schema','signalboost-builder-job-v1','jobId',p_job_id,'workspaceId',v_job.workspace_id,'status',v_status,'error',v_error,'repositoryMergePending',false)
   where id=v_job.history_message_id and user_id=p_user_id;
end;
$function$;
