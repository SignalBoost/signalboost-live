from __future__ import annotations

from types import SimpleNamespace

import pytest

from app import crewai_runtime as runtime


def test_unknown_specialist_role_is_rejected():
    with pytest.raises(runtime.CrewMissionRejected, match="Unsupported COS AI role"):
        runtime._normalize_roles(["software-wizard"])


def test_coordinator_cannot_be_selected_as_a_specialist():
    with pytest.raises(runtime.CrewMissionRejected, match="not a selectable specialist"):
        runtime._normalize_roles(["crew-coordinator"])


def test_authority_expansion_is_rejected_before_crewai_runs():
    with pytest.raises(runtime.CrewMissionRejected, match="cannot receive authority"):
        runtime._assert_read_only_authority(
            {
                "authority": {
                    "allow_external_side_effects": True,
                    "allow_referee_override": True,
                }
            }
        )


def test_missing_or_public_inference_endpoint_fails_closed(monkeypatch):
    monkeypatch.delenv("COS_CREWAI_BASE_URL", raising=False)
    with pytest.raises(runtime.CrewRuntimeUnavailable, match="fails closed"):
        runtime._private_base_url()

    monkeypatch.setenv("COS_CREWAI_BASE_URL", "https://api.openai.com/v1")
    with pytest.raises(runtime.CrewRuntimeUnavailable, match="private/internal"):
        runtime._private_base_url()


def test_private_inference_endpoint_is_allowed(monkeypatch):
    monkeypatch.setenv("COS_CREWAI_BASE_URL", "http://host.docker.internal:11434/v1")
    assert runtime._private_base_url() == "http://host.docker.internal:11434/v1"


def test_successful_crew_is_ephemeral_and_advisory(monkeypatch):
    captured = {}

    class FakeCrew:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def kickoff(self):
            return SimpleNamespace(raw="Specialists agree more evidence is required before COS decides.")

    monkeypatch.setattr(runtime, "_local_llm", lambda: object())
    monkeypatch.setattr(runtime, "Agent", lambda **kwargs: SimpleNamespace(**kwargs))
    monkeypatch.setattr(runtime, "Task", lambda **kwargs: SimpleNamespace(**kwargs))
    monkeypatch.setattr(runtime, "Crew", FakeCrew)

    result = runtime.run_specialist_crew(
        {
            "mission_id": "mission-test",
            "objective": "Review whether the proposed architecture is production-ready.",
            "roles": ["architect", "ai-engineer", "ethics"],
            "mode": "review",
            "evidence": "Host supplied test and deployment evidence.",
        }
    )

    assert result["ok"] is True
    assert result["status"] == "advisory_complete"
    assert result["roles"] == ["architect", "ai-engineer", "ethics"]
    assert result["authority"]["side_effects_allowed"] is False
    assert result["authority"]["referee_override_allowed"] is False
    assert result["memory"] == {"scope": "mission_ephemeral", "durable_memory_used": False}
    assert captured["memory"] is False
    assert captured["cache"] is False
