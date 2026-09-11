from __future__ import annotations

import os
from time import perf_counter
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Request
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import JSONResponse, Response

from .compliance import assess_compliance, build_audit_event
from .crewai_runtime import CrewMissionRejected, CrewRuntimeUnavailable, run_specialist_crew
from .monitoring import REQUEST_COUNT, REQUEST_LATENCY
from .roles import get_role_config, supported_roles

ROLE = os.getenv("COS_AI_ROLE", "architect")
try:
    CONFIG = get_role_config(ROLE)
except ValueError as exc:
    raise RuntimeError(str(exc)) from exc

app = FastAPI(title=f"COS AI Department - {CONFIG['title']}", version="1.1.0")


@app.middleware("http")
async def collect_metrics(request: Request, call_next):
    endpoint = request.url.path
    start = perf_counter()
    response = await call_next(request)
    REQUEST_COUNT.labels(role=ROLE, endpoint=endpoint).inc()
    REQUEST_LATENCY.labels(role=ROLE, endpoint=endpoint).observe(perf_counter() - start)
    return response


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "role": ROLE, "service": CONFIG["title"]}


@app.get("/metadata")
def metadata() -> Dict[str, Any]:
    return {"role": ROLE, "supported_roles": supported_roles(), **CONFIG}


@app.post("/tasks")
def create_task(payload: Dict[str, Any]) -> Dict[str, Any]:
    action = str(payload.get("action", "department-task"))
    compliance = assess_compliance(CONFIG["compliance_controls"], payload)
    audit_event = build_audit_event(ROLE, action, payload, CONFIG["compliance_controls"])
    return {
        "accepted": compliance["status"] == "approved",
        "role": ROLE,
        "service": CONFIG["title"],
        "capabilities": CONFIG["capabilities"],
        "compliance": compliance,
        "audit_event": audit_event,
    }


@app.post("/crew/missions")
def create_crew_mission(payload: Dict[str, Any]):
    if ROLE != "crew-coordinator":
        raise HTTPException(status_code=404, detail="Crew missions are available only on the crew-coordinator service.")
    try:
        return run_specialist_crew(payload)
    except CrewMissionRejected as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except CrewRuntimeUnavailable as exc:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "status": "private_inference_unavailable",
                "framework": "crewai",
                "side_effects_allowed": False,
                "error": str(exc),
            },
        )


@app.post("/compliance/check")
def compliance_check(payload: Dict[str, Any]) -> Dict[str, Any]:
    return assess_compliance(CONFIG["compliance_controls"], payload)


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
