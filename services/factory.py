"""Pick the live COS model when provided, else the default policy."""

from __future__ import annotations

from typing import Any

from llm_policy import LlmClient, LlmPolicy
from policy import DefaultDeveloperPolicy


def choose_policy(client: LlmClient | None = None) -> Any:
    if client is not None:
        return LlmPolicy(client)
    return DefaultDeveloperPolicy()
