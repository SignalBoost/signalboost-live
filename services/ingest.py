"""Land user files in the COS sandbox. Never read COS source."""

from __future__ import annotations

from pathlib import Path

from sandbox import Sandbox, SandboxError


def ingest_attachments(sandbox: Sandbox, attachments: list[str] | None) -> list[str]:
    landed: list[str] = []
    for item in attachments or []:
        src = Path(item)
        if not src.is_file():
            continue
        name = src.name
        try:
            text = src.read_text(encoding="utf-8", errors="replace")
            sandbox.write_file(name, text)
            landed.append(name)
        except SandboxError:
            continue
    return landed
