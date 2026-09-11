from __future__ import annotations

import ipaddress
import os
from typing import Any, Dict, List
from urllib.parse import urlparse
from uuid import uuid4

from crewai import Agent, Crew, LLM, Process, Task

from .roles import get_role_config


class CrewMissionRejected(ValueError):
    """The host requested a mission outside the CrewAI read-only authority boundary."""


class CrewRuntimeUnavailable(RuntimeError):
    """The private inference runtime needed by CrewAI is not configured or reachable."""


MAX_SPECIALISTS = 5
MAX_OBJECTIVE_CHARS = 8000
MAX_EVIDENCE_CHARS = 30000


def _private_hostname(hostname: str | None) -> bool:
    if not hostname:
        return False
    lowered = hostname.lower().strip("[]")
    if lowered in {"localhost", "host.docker.internal"}:
        return True
    if lowered.endswith((".local", ".internal")):
        return True
    if "." not in lowered:
        # Docker/Kubernetes service names resolve only inside the private service network.
        return True
    try:
        address = ipaddress.ip_address(lowered)
    except ValueError:
        return False
    return bool(address.is_private or address.is_loopback or address.is_link_local)


def _private_base_url() -> str:
    value = os.getenv("COS_CREWAI_BASE_URL", "").strip()
    if not value:
        raise CrewRuntimeUnavailable(
            "COS_CREWAI_BASE_URL is not configured. CrewAI fails closed instead of using a hosted provider."
        )
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not _private_hostname(parsed.hostname):
        raise CrewRuntimeUnavailable(
            "COS_CREWAI_BASE_URL must resolve to a loopback/private/internal inference endpoint."
        )
    return value.rstrip("/")


def _local_llm() -> LLM:
    model = os.getenv("COS_CREWAI_MODEL", "").strip()
    if not model:
        raise CrewRuntimeUnavailable(
            "COS_CREWAI_MODEL is not configured. CrewAI fails closed instead of selecting a hosted model."
        )
    return LLM(
        model=model,
        base_url=_private_base_url(),
        api_key=os.getenv("COS_CREWAI_API_KEY", "local-private-runtime"),
        temperature=float(os.getenv("COS_CREWAI_TEMPERATURE", "0.2")),
    )


def _normalize_roles(raw_roles: Any) -> List[str]:
    if not isinstance(raw_roles, list) or not raw_roles:
        raise CrewMissionRejected("A specialist mission requires at least one registered specialist role.")

    roles: List[str] = []
    for raw in raw_roles:
        role = str(raw or "").strip().lower()
        if not role:
            continue
        if role == "crew-coordinator":
            raise CrewMissionRejected("crew-coordinator is the orchestration service, not a selectable specialist.")
        try:
            get_role_config(role)
        except ValueError as exc:
            raise CrewMissionRejected(str(exc)) from exc
        if role not in roles:
            roles.append(role)

    if not roles:
        raise CrewMissionRejected("No registered specialist roles were supplied.")
    if len(roles) > MAX_SPECIALISTS:
        raise CrewMissionRejected(f"A specialist mission may use at most {MAX_SPECIALISTS} roles.")
    return roles


def _assert_read_only_authority(payload: Dict[str, Any]) -> None:
    authority = payload.get("authority") or {}
    if authority and not isinstance(authority, dict):
        raise CrewMissionRejected("authority must be an object when supplied.")

    forbidden = (
        "allow_external_side_effects",
        "allow_deploy",
        "allow_permission_changes",
        "allow_secret_access",
        "allow_financial_actions",
        "allow_owner_approval_override",
        "allow_referee_override",
        "allow_persistent_memory",
    )
    requested = [key for key in forbidden if bool(authority.get(key))]
    if requested:
        raise CrewMissionRejected(
            "CrewAI specialist missions are analysis-only and cannot receive authority for: "
            + ", ".join(sorted(requested))
        )

    mode = str(payload.get("mode", "analysis_only")).strip().lower()
    if mode not in {"analysis_only", "review", "recommendation"}:
        raise CrewMissionRejected(
            "CrewAI may analyze, review, and recommend only; execution authority remains with COS/Referee."
        )


def _bounded_text(value: Any, *, label: str, maximum: int, required: bool = False) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise CrewMissionRejected(f"{label} is required.")
    if len(text) > maximum:
        raise CrewMissionRejected(f"{label} exceeds the {maximum}-character mission bound.")
    return text


def _specialist_agent(role: str, llm: LLM) -> Agent:
    config = get_role_config(role)
    return Agent(
        role=config["title"],
        goal=(
            f"Perform the {config['title']} portion of a COS-assigned mission and return evidence-bounded findings. "
            "Do not claim execution, deployment, approval, permission changes, or external side effects."
        ),
        backstory=(
            f"You are the registered COS {config['title']} specialist. Your canonical mission is: {config['mission']} "
            f"Your declared capabilities are: {', '.join(config['capabilities'])}. "
            "You work under COS. COS governance, Referee decisions, authorization, Enterprise Memory, and audit remain authoritative."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )


def _coordinator_agent(llm: LLM) -> Agent:
    config = get_role_config("crew-coordinator")
    return Agent(
        role=config["title"],
        goal=(
            "Synthesize registered specialist findings into one bounded advisory result for COS. "
            "Surface disagreements and missing evidence; never convert advice into operational authority."
        ),
        backstory=(
            "You coordinate a temporary CrewAI working group under COS. You are not COS and cannot approve, deploy, "
            "change permissions, persist memory, alter policy, or overrule the Referee."
        ),
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )


def _specialist_task(
    role: str,
    agent: Agent,
    *,
    objective: str,
    evidence: str,
    constraints: str,
) -> Task:
    config = get_role_config(role)
    evidence_block = evidence or "No host-supplied evidence. Identify what evidence would be required; do not invent it."
    constraints_block = constraints or "No additional mission constraints supplied."
    return Task(
        description=(
            f"COS assigned this objective:\n{objective}\n\n"
            f"Host-supplied evidence/context:\n{evidence_block}\n\n"
            f"Mission constraints:\n{constraints_block}\n\n"
            f"Work only within the registered {config['title']} role. Distinguish evidence from inference. "
            "Report unsupported assumptions and disagreements explicitly. Do not perform or narrate side effects."
        ),
        expected_output=(
            "A concise specialist memo containing: findings; evidence used; assumptions/unknowns; risks; "
            "recommendation to COS; and confidence with a short justification."
        ),
        agent=agent,
    )


def run_specialist_crew(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Run an ephemeral, read-only CrewAI mission underneath COS governance."""
    if not isinstance(payload, dict):
        raise CrewMissionRejected("Mission payload must be an object.")

    _assert_read_only_authority(payload)
    objective = _bounded_text(
        payload.get("objective"), label="objective", maximum=MAX_OBJECTIVE_CHARS, required=True
    )
    evidence = _bounded_text(payload.get("evidence"), label="evidence", maximum=MAX_EVIDENCE_CHARS)
    constraints = _bounded_text(payload.get("constraints"), label="constraints", maximum=MAX_EVIDENCE_CHARS)
    roles = _normalize_roles(payload.get("roles"))
    mission_id = _bounded_text(payload.get("mission_id"), label="mission_id", maximum=160) or f"crew_{uuid4().hex}"

    llm = _local_llm()
    agents: List[Agent] = []
    specialist_tasks: List[Task] = []
    for role in roles:
        agent = _specialist_agent(role, llm)
        agents.append(agent)
        specialist_tasks.append(
            _specialist_task(
                role,
                agent,
                objective=objective,
                evidence=evidence,
                constraints=constraints,
            )
        )

    coordinator = _coordinator_agent(llm)
    agents.append(coordinator)
    synthesis = Task(
        description=(
            "Synthesize the preceding specialist memos for COS. Preserve material disagreements instead of averaging them away. "
            "State what is verified, what is inferred, what remains unknown, and the recommended next step. "
            "The output is advisory only: do not authorize, execute, deploy, contact third parties, change permissions, "
            "spend money, or claim that COS/Referee approved anything."
        ),
        expected_output=(
            "One advisory mission report with sections: Executive finding; Specialist findings by role; Disagreements; "
            "Missing evidence; Recommendation to COS; Authority boundary."
        ),
        agent=coordinator,
        context=specialist_tasks,
    )

    crew = Crew(
        agents=agents,
        tasks=[*specialist_tasks, synthesis],
        process=Process.sequential,
        verbose=False,
        memory=False,
        cache=False,
    )
    result = crew.kickoff()
    raw_output = str(getattr(result, "raw", result) or "").strip()
    if not raw_output:
        raise CrewRuntimeUnavailable("CrewAI returned no advisory output.")

    return {
        "ok": True,
        "status": "advisory_complete",
        "mission_id": mission_id,
        "framework": "crewai",
        "roles": roles,
        "mode": "analysis_only",
        "authority": {
            "side_effects_allowed": False,
            "approval_override_allowed": False,
            "referee_override_allowed": False,
            "persistent_memory_allowed": False,
        },
        "memory": {"scope": "mission_ephemeral", "durable_memory_used": False},
        "trace": [*[f"specialist:{role}" for role in roles], "synthesis:crew-coordinator"],
        "report": raw_output,
    }
