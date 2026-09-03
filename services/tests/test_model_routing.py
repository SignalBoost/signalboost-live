from __future__ import annotations

from llm_policy import LlmPolicy
from model_client import DEFAULT_BUILDER_MODEL, OpenAICompatibleBuilderClient
from policy import DefaultDeveloperPolicy
from factory import choose_policy


class FakeClient:
    def complete(self, prompt):
        return {"final": "ok"}


def test_builder_model_defaults_to_deepseek_flash(monkeypatch):
    monkeypatch.setenv("LOCAL_AI_API_KEY", "test-key")
    monkeypatch.delenv("BUILDER_AI_MODEL", raising=False)
    client = OpenAICompatibleBuilderClient.from_env()
    assert client is not None
    assert client.model == DEFAULT_BUILDER_MODEL
    assert client.model == "deepseek-ai/DeepSeek-V4-Flash-0731"


def test_builder_model_can_be_server_overridden(monkeypatch):
    monkeypatch.setenv("LOCAL_AI_API_KEY", "test-key")
    monkeypatch.setenv("BUILDER_AI_MODEL", "example/coding-model")
    client = OpenAICompatibleBuilderClient.from_env()
    assert client is not None
    assert client.model == "example/coding-model"


def test_builder_keeps_safe_fallback_without_server_key(monkeypatch):
    monkeypatch.delenv("LOCAL_AI_API_KEY", raising=False)
    monkeypatch.setenv("BUILDER_AI_MODEL", "example/ignored-without-key")
    assert isinstance(choose_policy(), DefaultDeveloperPolicy)


def test_injected_builder_client_uses_llm_policy_without_env(monkeypatch):
    monkeypatch.delenv("LOCAL_AI_API_KEY", raising=False)
    assert isinstance(choose_policy(FakeClient()), LlmPolicy)
