"""Server-side OpenAI-compatible client for the COS Builder coding model.

This module selects compute only. Builder/Platform Engineer authorization and tool
permissions remain outside the model client.
"""

from __future__ import annotations

import json
import os
from typing import Any
from urllib import error, request

DEFAULT_BUILDER_MODEL = "deepseek-ai/DeepSeek-V4-Flash-0731"
DEFAULT_LOCAL_AI_BASE_URL = "https://api.deepinfra.com/v1/openai"


class OpenAICompatibleBuilderClient:
    """Minimal OpenAI-compatible client used only by Builder control turns."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
        timeout_seconds: float = 60.0,
    ) -> None:
        self.api_key = api_key
        self.model = (model or DEFAULT_BUILDER_MODEL).strip() or DEFAULT_BUILDER_MODEL
        self.base_url = (base_url or DEFAULT_LOCAL_AI_BASE_URL).rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "OpenAICompatibleBuilderClient | None":
        api_key = os.getenv("LOCAL_AI_API_KEY", "").strip()
        if not api_key:
            return None
        return cls(
            api_key=api_key,
            model=os.getenv("BUILDER_AI_MODEL", DEFAULT_BUILDER_MODEL),
            base_url=os.getenv("LOCAL_AI_BASE_URL", DEFAULT_LOCAL_AI_BASE_URL),
        )

    def complete(self, prompt: dict[str, Any]) -> dict[str, Any]:
        system = str(prompt.get("system") or "")
        control = (
            system
            + "\nReturn exactly one JSON object and no markdown. "
            + 'Use either {"tool":{"name":"...","args":{...}}} or {"final":"..."}. '
            + "Never invent tools. Available tools: "
            + json.dumps(prompt.get("tools") or [], separators=(",", ":"))
        )
        user_payload = {
            "message": prompt.get("message") or "",
            "files": prompt.get("files") or [],
            "history": prompt.get("history") or [],
        }
        body = json.dumps(
            {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": control},
                    {"role": "user", "content": json.dumps(user_payload, separators=(",", ":"))},
                ],
                "temperature": 0,
                "max_tokens": 1200,
            }
        ).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            return {"final": f"Builder model request failed safely: {type(exc).__name__}."}

        choices = payload.get("choices") or []
        if not choices:
            return {"final": "Builder model returned no choice."}
        content = ((choices[0].get("message") or {}).get("content") or "").strip()
        if not content:
            return {"final": "Builder model returned an empty response."}
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return {"final": content}
        return parsed if isinstance(parsed, dict) else {"final": content}
