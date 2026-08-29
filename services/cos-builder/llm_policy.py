"""Hook for the live COS model.

Wire your model so it returns either a tool call or a final summary.
Until that exists, CosBrain uses DefaultDeveloperPolicy.
"""

from __future__ import annotations

from typing import Any, Protocol

from loop import PolicyDecision
from tools import TOOL_SCHEMAS, ToolCall, ToolResult


class LlmClient(Protocol):
    def complete(self, prompt: dict[str, Any]) -> dict[str, Any]:
        """Return {"final": str} or {"tool": {"name": str, "args": dict}}."""
        ...


class LlmPolicy:
    def __init__(self, client: LlmClient):
        self.client = client

    def decide(
        self,
        message: str,
        history: list[ToolResult],
        files: list[str],
    ) -> PolicyDecision:
        response = self.client.complete(
            {
                "system": (
                    "You are COS Builder. You write and debug the user's software "
                    "in a sandbox. You cannot modify COS or Concierge. Use tools."
                ),
                "message": message,
                "files": files,
                "history": [
                    {"name": h.name, "ok": h.ok, "data": h.data} for h in history
                ],
                "tools": TOOL_SCHEMAS,
            }
        )
        if response.get("final"):
            return PolicyDecision(final=True, summary=str(response["final"]))
        tool = response.get("tool") or {}
        if tool.get("name"):
            return PolicyDecision(
                call=ToolCall(str(tool["name"]), dict(tool.get("args") or {}))
            )
        return PolicyDecision(final=True, summary="Model returned no action.")
