from __future__ import annotations

from prometheus_client import Counter, Histogram

REQUEST_COUNT = Counter(
    "cos_ai_department_requests_total",
    "Total COS AI department API requests.",
    ["role", "endpoint"],
)

REQUEST_LATENCY = Histogram(
    "cos_ai_department_request_seconds",
    "COS AI department endpoint latency.",
    ["role", "endpoint"],
)
