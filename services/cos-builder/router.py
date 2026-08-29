"""Single coding gate for both faces.

Concierge = public face
COS       = brain

Both call the same BuilderSession. Coding requests skip skill retrieval.
"""

from __future__ import annotations

from pathlib import Path

from builder import BuilderResult, BuilderSession, route_from_concierge, route_from_cos
from classifier import classify_coding_intent

DEFAULT_SANDBOX_ROOT = Path(__file__).resolve().parent / "sandboxes"


class CosBrain:
    def __init__(self, sandbox_root: Path | None = None, policy=None):
        self.sandbox_root = sandbox_root or DEFAULT_SANDBOX_ROOT
        self.policy = policy
        self.sessions: dict[str, BuilderSession] = {}

    def session(self, session_id: str) -> BuilderSession:
        if session_id not in self.sessions:
            self.sessions[session_id] = BuilderSession(
                session_id, self.sandbox_root, policy=self.policy
            )
        return self.sessions[session_id]

    def receive(
        self,
        message: str,
        *,
        session_id: str,
        face: str = "concierge",
        attachments: list[str] | None = None,
    ) -> BuilderResult:
        intent = classify_coding_intent(message, attachments)
        if not intent.is_coding and not intent.refuse_self_modify:
            return BuilderResult(
                handled_by="concierge-normal" if face == "concierge" else "cos-normal",
                is_coding=False,
                refused_self_modify=False,
                summary="Normal non-coding path. Do not open Builder.",
                output="NORMAL_PATH",
            )
        sess = self.session(session_id)
        if face == "cos":
            return route_from_cos(message, sess, attachments)
        return route_from_concierge(message, sess, attachments)
