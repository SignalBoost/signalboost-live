-- PostgreSQL text already rejects NUL bytes. chr(0) itself is invalid and made every file insert fail.
alter table public.builder_workspace_files
  drop constraint if exists builder_workspace_files_content_nul_check;
