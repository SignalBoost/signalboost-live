-- Expand provider-kind allowlist without altering tenant isolation, grants, or encryption.
-- These entries authorize credential storage for built-in HTTP teacher adapters only.
-- They do not authorize new training/GPU execution paths or spending by themselves.
begin;
alter table lab.provider_credentials drop constraint if exists provider_credentials_provider_kind_check;
alter table lab.provider_credentials
  add constraint provider_credentials_provider_kind_check
  check (provider_kind in ('huggingface','openai','anthropic','gemini','xai','deepseek','qwen','mistral','groq','openrouter','together','fireworks','deepinfra','openai_compatible'));
commit;
