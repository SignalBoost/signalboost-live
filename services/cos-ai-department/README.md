# COS AI Department Microservices

This package implements the COS AI department as seven independently deployed specialist FastAPI services plus one CrewAI coordinator service that lets COS assemble temporary multi-specialist working groups.

| Layer | Service role | Local port |
| --- | --- | --- |
| ML Engineer | `ml-engineer` | `8101` |
| AI Engineer | `ai-engineer` | `8102` |
| Architect | `architect` | `8103` |
| Data Scientist | `data-scientist` | `8104` |
| Data Engineer | `data-engineer` | `8105` |
| Research | `research` | `8106` |
| Ethics | `ethics` | `8107` |
| Specialist crew coordinator | `crew-coordinator` | `8108` |

All services use the same hardened FastAPI runtime and become separate API services through the `COS_AI_ROLE` environment variable. This keeps deployment consistent while preserving separate Kubernetes Deployments, Services, metrics labels, health checks, and compliance controls per department layer.

## CrewAI boundary

`crew-coordinator` uses CrewAI only as a bounded specialist-collaboration runtime underneath COS. It accepts registered specialist roles, runs an ephemeral sequential working group, and returns an advisory synthesis to COS.

CrewAI does **not** own authorization, provider selection, Referee policy, approval state, Enterprise Memory, University credentials, deployment, secrets, billing, or external side effects. The coordinator rejects requests that attempt to grant any of those authorities. Crew memory is disabled; durable truth remains in COS/Enterprise Memory.

The coordinator also fails closed unless both `COS_CREWAI_BASE_URL` and `COS_CREWAI_MODEL` point it at an explicitly configured private/local inference runtime. Public hosted endpoints are rejected and there is no silent OpenAI/Anthropic fallback.

Required coordinator configuration:

- `COS_CREWAI_BASE_URL` — loopback/private/internal model endpoint.
- `COS_CREWAI_MODEL` — explicit CrewAI/LiteLLM model identifier for that local endpoint.
- `COS_CREWAI_API_KEY` — optional credential for the private endpoint; defaults to a non-secret local placeholder.

## API surface

Every service exposes:

- `GET /health` for readiness and liveness checks.
- `GET /metadata` for role mission, capabilities, compliance controls, and supported roles.
- `POST /tasks` to accept role-specific work with compliance evaluation and redacted audit evidence.
- `POST /compliance/check` to evaluate required evidence before execution.
- `GET /metrics` for Prometheus scraping.

The `crew-coordinator` additionally exposes:

- `POST /crew/missions` — an analysis/review/recommendation-only CrewAI mission using 1–5 registered specialist roles. The response includes the role trace, explicit no-side-effect authority envelope, ephemeral-memory receipt, and advisory report.

## Local deployment

```bash
export COS_CREWAI_BASE_URL=http://host.docker.internal:11434/v1
export COS_CREWAI_MODEL=openai/your-local-model
docker compose -f docker-compose.cos-ai.yml up --build
```

Prometheus is available at `http://localhost:9090`, the seven specialist APIs are exposed on ports `8101` through `8107`, and the CrewAI coordinator is on `8108`.

## Kubernetes deployment

```bash
kubectl apply -f k8s/cos-ai-department/
```

The existing manifests create a `cos-ai-department` namespace, specialist Deployments and Services, Prometheus scrape annotations, health probes, resource requests/limits, and a compliance ConfigMap. A Production CrewAI coordinator requires an equivalent private deployment plus the private inference configuration above; a repository implementation or build alone is not Production evidence.

## Compliance and monitoring

- Compliance rules are documented in `compliance/cos-ai-department/policy.yaml` and enforced at runtime by `app/compliance.py`.
- Sensitive request keys such as `password`, `secret`, `token`, `api_key`, `authorization`, and `ssn` are redacted before audit output.
- Prometheus counters and histograms are defined in `app/monitoring.py` and exposed by every role-specific service.
- CrewAI missions are advisory-only, registered-role-only, ephemeral-memory-only, and may not expand COS/Referee authority.
