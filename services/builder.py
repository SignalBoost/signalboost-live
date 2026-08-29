"""COS Builder core.

Concierge is the public face. COS owns this session and the tools.
A coding request from Concierge is executed here, not by a second agent.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from classifier import classify_coding_intent
from factory import choose_policy
from ingest import ingest_attachments
from loop import run_developer_loop
from sandbox import Sandbox
from tools import ToolExecutor

SELF_MODIFY_REFUSAL = (
    "I can help write and debug your software. "
    "I cannot modify COS, Concierge, or the agent internals."
)


@dataclass
class BuilderResult:
    handled_by: str
    is_coding: bool
    refused_self_modify: bool
    summary: str
    files_changed: list[str] = field(default_factory=list)
    commands: list[dict] = field(default_factory=list)
    files: dict[str, str] = field(default_factory=dict)
    output: str = ""


class BuilderSession:
    """The COS coding loop. One sandbox per user session."""

    def __init__(self, session_id: str, base_dir: Path, policy=None):
        self.session_id = session_id
        self.sandbox = Sandbox(base_dir / session_id)
        self.policy = policy or choose_policy()

    def handle(
        self,
        message: str,
        attachments: list[str] | None = None,
        *,
        source: str = "concierge",
    ) -> BuilderResult:
        intent = classify_coding_intent(message, attachments)
        if intent.refuse_self_modify:
            return BuilderResult(
                handled_by="cos-builder",
                is_coding=intent.is_coding,
                refused_self_modify=True,
                summary=SELF_MODIFY_REFUSAL,
                output=SELF_MODIFY_REFUSAL,
            )
        if not intent.is_coding:
            return BuilderResult(
                handled_by="cos-builder",
                is_coding=False,
                refused_self_modify=False,
                summary="Not a coding request; Concierge should keep the normal path.",
            )
        self.sandbox.reset_turn_counters()
        ingest_attachments(self.sandbox, attachments)
        executor = ToolExecutor(self.sandbox)
        loop = run_developer_loop(message, executor, self.policy)
        changed = list(dict.fromkeys(executor.changed))
        return self._result(source, loop.summary, changed, executor.commands)

    def _result(
        self,
        source: str,
        summary: str,
        changed: list[str],
        commands: list[dict],
    ) -> BuilderResult:
        files = {name: self.sandbox.read_file(name) for name in changed}
        lines = [
            f"Handled by COS Builder (request came from {source}).",
            "Cognitive-skills retrieval skipped.",
            "Tool loop used (inspect → edit → run).",
            summary,
        ]
        for cmd in commands:
            lines.append(f"$ {' '.join(cmd['argv'])}  (exit {cmd['exit_code']})")
            if cmd.get("stdout"):
                lines.append(cmd["stdout"].rstrip())
            if cmd.get("stderr"):
                lines.append(cmd["stderr"].rstrip())
        return BuilderResult(
            handled_by="cos-builder",
            is_coding=True,
            refused_self_modify=False,
            summary=summary,
            files_changed=changed,
            commands=commands,
            files=files,
            output="\n".join(lines),
        )


def route_from_concierge(
    message: str,
    session: BuilderSession,
    attachments: list[str] | None = None,
) -> BuilderResult:
    """Concierge entrypoint. COS still owns execution."""
    return session.handle(message, attachments, source="concierge")


def route_from_cos(
    message: str,
    session: BuilderSession,
    attachments: list[str] | None = None,
) -> BuilderResult:
    """Direct COS entrypoint. Same brain, no second agent."""
    return session.handle(message, attachments, source="cos")
