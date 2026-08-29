"""COS developer loop: policy decides, tools execute, repeat."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from tools import ToolCall, ToolExecutor, ToolResult


@dataclass
class PolicyDecision:
    final: bool = False
    summary: str = ""
    call: ToolCall | None = None


class DeveloperPolicy(Protocol):
    def decide(
        self,
        message: str,
        history: list[ToolResult],
        files: list[str],
    ) -> PolicyDecision:
        ...


@dataclass
class LoopResult:
    summary: str
    steps: int
    history: list[ToolResult] = field(default_factory=list)


def run_developer_loop(
    message: str,
    executor: ToolExecutor,
    policy: DeveloperPolicy,
    *,
    max_steps: int = 10,
) -> LoopResult:
    history: list[ToolResult] = []
    summary = "Stopped without a final answer."
    steps = 0
    for steps in range(1, max_steps + 1):
        files = []
        listed = [h for h in history if h.name == "list_files" and h.ok]
        if listed:
            files = list(listed[-1].data or [])
        decision = policy.decide(message, history, files)
        if decision.final:
            summary = decision.summary or "Done."
            break
        if decision.call is None:
            summary = "Policy returned no action."
            break
        history.append(executor.execute(decision.call))
    return LoopResult(summary=summary, steps=steps, history=history)
