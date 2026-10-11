# Customer LAB v6 integration
Read root ONBOARD.md and AGENTS.md before changing this implementation.

Customer workspace initialization creates an owner membership, zero-funded credit account, private project and experiment in one idempotent transaction. It never launches paid work. Provider keys are encrypted per organization; customers select a teacher or supply their own examples, and training uses their HF Jobs account. Ordinary result retrieval has no graduation/certification gate.

Integration fixes beyond the supplied v6 patch: native Promise wrappers around Supabase RPC builders; typed download denial; RTL spacing; customer workspace creation; additive PostgREST service-role provisioning correction; monitoring reads recorded JSON evidence rather than a nonexistent authority_expanded column. The authority-expansion metric counts only explicitly recorded true values, not proof that unspecified events were safe.

Required migrations (chronological order):
- 20261011225542_lab_customer_workspace_provisioning.sql
- 20261012000000_lab_customer_provider_credentials_and_training.sql
- 20261012010000_lab_customer_teacher_spend.sql

Local verification includes the customer regression suites, eleven-language/RTL validation, TypeScript and the existing COS release gate. Green checks do not prove migrations were applied or providers ran.

Staging instructions: scripts/lab-staging-kit/README.md. Apply migrations through the approved staging process before checking versions. Enter disposable customer credentials through LAB; configure real verified teacher rate cards and model overhead. Hosted teacher invocation refuses models without an active card. Approve a bounded test budget before provider execution.

Unverified: real Supabase/PostgREST permissions and concurrency; teacher billed-token bounds and invoice reconciliation; HF dispatch/recovery; customer member artifact delivery; runtime Supervisor credential separation. The current encryption key is shared with the platform vault. Import-denial tests and SQL grants alone do not prove runtime separation; a process possessing both privileged database access and the master encryption key can decrypt. Do not claim customer keys can never be reached by Supervisor until separate runtime ownership is verified.

HF is the currently implemented training adapter, not a promise that arbitrary providers support training. Teacher connectivity and MCP discovery do not grant training or export capabilities. A successful training job does not guarantee model improvement.


Read-only production inspection on 2026-10-11 confirmed that the primary database has the assurance JSON evidence column but no authority_expanded column, and lacks public.itmounts_lab_experiment_start_options(uuid). The customer read failure therefore includes an absent RPC, not merely zero organizations. The three new migration versions were not present in the queried registry. No staging branches were present in either connected project; no database mutations or provider calls were performed.

Before live verification, reconcile the existing 20261008020000_lab_experiment_execution_scope.sql migration and confirm the experiment-options RPC exists. Apply the new migration sequence on staging, not blindly on production. Integration labels on the customer, European-account and diagnostics surfaces have eleven-language copies; translations have not had native-speaker review.
