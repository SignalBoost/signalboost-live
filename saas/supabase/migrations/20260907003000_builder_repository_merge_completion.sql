-- Platform Engineer repository repairs are not terminal successes until the governed PR is merged.
-- The app may finish its initial Vercel slice while GitHub checks are still running; in that case
-- park the job as paused with no ordinary Builder checkpoint. The dedicated repository-merge cron
-- later promotes it to succeeded after the merge has actually occurred.
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
  v_platform_repair boolean := false;
  v_pause_for_merge boolean := false;
  v_effective_status text := p_status;
  v_effective_reply text := trim(coalesce(p_reply, ''));
  v_effective_error text := nullif(p_error, '');
  v_result jsonb := coalesce(p_result, '{}'::jsonb);
  v_files jsonb := '[]'::jsonb;
  v_pull_request_number integer := null;
  v_merge_commit_sha text := null;
  v_updated_at timestamptz := now();
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'builder_job_invalid_terminal_status';
  end if;
  if char_length(v_effective_reply) < 1 then
    raise exception 'builder_job_reply_required';
  end if;

  select * into v_job
  from public.builder_jobs
  where id = p_job_id
    and user_id = p_user_id
    and status = 'running'
    and claim_generation = p_generation
  for update;

  if not found then
    return;
  end if;

  v_platform_repair := coalesce(v_job.metadata->>'platformRepair', 'false') = 'true';
  if coalesce(v_result->>'pull_request_number', '') ~ '^[1-9][0-9]*$' then
    v_pull_request_number := (v_result->>'pull_request_number')::integer;
  end if;
  if coalesce(v_result->>'merge_commit_sha', '') ~ '^[0-9a-fA-F]{40}$' then
    v_merge_commit_sha := lower(v_result->>'merge_commit_sha');
  end if;

  if v_platform_repair and p_status = 'succeeded' then
    if coalesce(v_result->>'merge_taken', 'false') = 'true'
       and v_pull_request_number is not null
       and v_merge_commit_sha is not null then
      v_result := v_result || jsonb_build_object(
        'status', 'succeeded',
        'repository_merge_pending', false,
        'merge_taken', true,
        'merge_commit_sha', v_merge_commit_sha
      );
      v_effective_reply := v_effective_reply || format(
        E'\n\nRepository outcome: PR #%s was committed and merged to main as %s.',
        v_pull_request_number,
        v_merge_commit_sha
      );
    elsif coalesce(v_result->>'repository_write_stage', '') = 'pr_created'
       and coalesce(v_result->>'merge_allowed', 'false') = 'true'
       and v_pull_request_number is not null then
      v_pause_for_merge := true;
      v_effective_status := 'paused';
      v_effective_error := null;
      v_result := v_result || jsonb_build_object(
        'status', 'paused',
        'repository_merge_pending', true,
        'merge_taken', false
      );
      v_effective_reply := format(
        E'Builder verified the repository repair and created PR #%s, but the job is not complete yet. GitHub CI/merge is still pending. Builder will mark this job succeeded only after that PR is actually merged.\n\n%s',
        v_pull_request_number,
        v_effective_reply
      );
    else
      v_effective_status := 'failed';
      v_effective_error := 'builder_repository_merge_incomplete';
      v_result := v_result || jsonb_build_object(
        'status', 'failed',
        'repository_merge_pending', false,
        'error', v_effective_error
      );
      v_effective_reply := E'Builder did not complete the repository repair because the required commit/PR/merge lifecycle did not finish. It has not been reported as successful.\n\n' || v_effective_reply;
    end if;
  end if;

  -- Platform Engineer jobs always leave a plain-text owner deliverable, including failures and
  -- merge-pending states. Preserve the workspace file-count contract when creating it for the
  -- first time; updating an existing builder-result.txt is always allowed.
  if v_platform_repair and (
    exists (
      select 1 from public.builder_workspace_files
      where workspace_id = v_job.workspace_id and user_id = p_user_id and path = 'builder-result.txt'
    )
    or (
      select count(*) from public.builder_workspace_files
      where workspace_id = v_job.workspace_id and user_id = p_user_id
    ) < 100
  ) then
    insert into public.builder_workspace_files(workspace_id, user_id, path, content, updated_at)
    values (
      v_job.workspace_id,
      p_user_id,
      'builder-result.txt',
      'base64:' || replace(encode(convert_to(v_effective_reply || E'\n', 'UTF8'), 'base64'), E'\n', ''),
      v_updated_at
    )
    on conflict (workspace_id, path) do update
      set content = excluded.content,
          user_id = excluded.user_id,
          updated_at = excluded.updated_at;

    if jsonb_typeof(v_result->'files') = 'array' then
      v_files := v_result->'files';
    end if;
    if not v_files @> '["builder-result.txt"]'::jsonb then
      v_files := v_files || '["builder-result.txt"]'::jsonb;
    end if;
    v_result := jsonb_set(v_result, '{files}', v_files, true);

    if position('/files/builder-result.txt)' in v_effective_reply) = 0 then
      v_effective_reply := v_effective_reply || format(
        E'\n\nBuilder files:\n- [Download builder-result.txt](/api/builder/workspaces/%s/files/builder-result.txt)',
        v_job.workspace_id
      );
    end if;
  end if;

  if v_pause_for_merge then
    update public.builder_jobs
    set status = 'paused',
        checkpoint = null,
        result = v_result,
        error = null,
        updated_at = v_updated_at
    where id = p_job_id
      and user_id = p_user_id
      and status = 'running'
      and claim_generation = p_generation;

    update public.assistant_messages
    set content = left(v_effective_reply, 16000),
        provenance = jsonb_build_object(
          'schema', 'signalboost-builder-job-v1',
          'jobId', p_job_id,
          'workspaceId', v_job.workspace_id,
          'status', 'paused',
          'repositoryMergePending', true,
          'pullRequestNumber', v_pull_request_number
        )
    where id = v_job.history_message_id
      and user_id = p_user_id;

    update public.assistant_conversations
    set updated_at = v_updated_at
    where id = v_job.conversation_id
      and user_id = p_user_id;
    return;
  end if;

  update public.builder_jobs
  set status = v_effective_status,
      checkpoint = null,
      result = v_result,
      error = v_effective_error,
      finished_at = v_updated_at,
      updated_at = v_updated_at
  where id = p_job_id
    and user_id = p_user_id
    and status = 'running'
    and claim_generation = p_generation;

  update public.assistant_messages
  set content = left(v_effective_reply, 16000),
      provenance = jsonb_build_object(
        'schema', 'signalboost-builder-job-v1',
        'jobId', p_job_id,
        'workspaceId', v_job.workspace_id,
        'status', v_effective_status,
        'error', v_effective_error,
        'repositoryMergePending', false,
        'pullRequestNumber', v_pull_request_number,
        'mergeCommitSha', v_merge_commit_sha
      )
  where id = v_job.history_message_id
    and user_id = p_user_id;

  update public.assistant_conversations
  set updated_at = v_updated_at
  where id = v_job.conversation_id
    and user_id = p_user_id;
end;
$function$;
