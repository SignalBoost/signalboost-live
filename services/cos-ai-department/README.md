# COS AI Department Microservices

This package implements the COS AI department as seven independently deployed FastAPI services:

| Layer | Service role | Local port |
| --- | --- | --- |
| ML Engineer | `ml-engineer` | `8101` |
| AI Engineer | `ai-engineer` | `8102` |
| Architect | `architect` | `8103` |
| Data Scientist | `data-scientist` | `8104` |
| Data Engineer | `data-engineer` | `8105` |
| Research | `research` | `8106` |
| Ethics | `ethics` | `8107` |

All services use the same hardened FastAPI runtime and become separate API services through the `COS_AI_ROLE` environment variable. This keeps deployment consistent while preserving separate Kubernetes Deployments, Services, metrics labels, health checks, and compliance controls per department layer.

## API surface

Each service exposes:

- `GET /health` for readiness and liveness checks.
- `GET /metadata` for role mission, capabilities, compliance controls, and supported roles.
- `POST /tasks` to accept role-specific work with compliance evaluation and redacted audit evidence.
- `POST /compliance/check` to evaluate required evidence before execution.
- `GET /metrics` for Prometheus scraping.

## Local deployment

```bash
docker compose -f docker-compose.cos-ai.yml up --build
```

Prometheus is available at `http://localhost:9090`, and the seven APIs are exposed on ports `8101` through `8107`.

## Kubernetes deployment

```bash
kubectl apply -f k8s/cos-ai-department/
```

The manifests create a `cos-ai-department` namespace, one Deployment and one Service per layer, Prometheus scrape annotations, health probes, resource requests/limits, and a compliance ConfigMap.

## Compliance and monitoring

- Compliance rules are documented in `compliance/cos-ai-department/policy.yaml` and enforced at runtime by `app/compliance.py`.
- Sensitive request keys such as `password`, `secret`, `token`, `api_key`, `authorization`, and `ssn` are redacted before audit output.
- Prometheus counters and histograms are defined in `app/monitoring.py` and exposed by every role-specific service.
