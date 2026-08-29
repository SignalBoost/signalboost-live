"""Cheap coding-intent classifier for Concierge.

Keep this dumb on purpose. Do not send coding requests through
the cognitive-skills retriever until that layer actually matches.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

CODING_KEYWORDS = (
    "code",
    "coding",
    "debug",
    "debugging",
    "traceback",
    "stack trace",
    "stacktrace",
    "compile",
    "compiler",
    "refactor",
    "function",
    "script",
    "implement",
    "implementation",
    "unit test",
    "unittest",
    "pytest",
    "typeerror",
    "syntaxerror",
    "exception",
    "bug",
    "fix this",
    "write a",
    "python",
    "javascript",
    "typescript",
    "html",
    "css",
    "api",
    "endpoint",
    "repo",
    "source code",
)

SELF_MODIFY_MARKERS = (
    "rewrite cos",
    "modify cos",
    "change concierge internals",
    "edit concierge source",
    "promotion pipeline",
    "cognitive-skills layer",
    "agent internals",
    "modify yourself",
    "change your source",
)

CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".rb",
    ".php",
    ".sh",
    ".html",
    ".css",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".md",
    ".txt",
    ".log",
}

FENCE_RE = re.compile(r"```")


@dataclass
class CodingIntent:
    is_coding: bool
    refuse_self_modify: bool
    reasons: list[str] = field(default_factory=list)


def classify_coding_intent(
    message: str,
    attachments: list[str] | None = None,
) -> CodingIntent:
    text = (message or "").strip()
    lower = text.lower()
    reasons: list[str] = []
    attachments = attachments or []

    refuse = any(marker in lower for marker in SELF_MODIFY_MARKERS)
    if refuse:
        reasons.append("self-modification request")

    if any(k in lower for k in CODING_KEYWORDS):
        reasons.append("keyword")

    if FENCE_RE.search(text):
        reasons.append("fenced_code")

    for name in attachments:
        suffix = Path(name).suffix.lower()
        if suffix in CODE_EXTENSIONS:
            reasons.append(f"attachment:{suffix}")
            break

    coding_signals = [r for r in reasons if r != "self-modification request"]
    is_coding = bool(coding_signals) and not (
        refuse and not coding_signals
    )
    # Self-modify alone is not a user coding job.
    if refuse and not coding_signals:
        is_coding = False

    return CodingIntent(
        is_coding=is_coding,
        refuse_self_modify=refuse,
        reasons=reasons,
    )
