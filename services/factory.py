"""Pick the Builder coding specialist when configured, else the safe default."""

from __future__ import annotations

from typing import Any

from llm_policy import LlmClient, LlmPolicy
from model_client import OpenAICompatibleBuilderClient
from policy import DefaultDeveloperPolicy


def choose_policy(client: LlmClient | None = None) -> Any:
    """Return Builder's model policy without changing any execution authority.

    Tests/callers may inject a client explicitly. In normal server execution the
    Builder uses the existing LOCAL_AI_API_KEY transport and BUILDER_AI_MODEL.
    If no server-side key is configured, preserve the previous deterministic
    fallback instead of opening another provider or failing open.
    """
    selected = client or OpenAICompatibleBuilderClient.from_env()
    if selected is not None:
        return LlmPolicy(selected)
    return DefaultDeveloperPolicy()
