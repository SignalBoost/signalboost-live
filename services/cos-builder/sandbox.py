"""Per-session sandbox. Never points at COS source."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

BLOCKED_NAMES = {".env", "id_rsa", "id_ed25519", "credentials", "secrets.json"}
ALLOWED_BINARIES = {"python3", "python", "node", "pytest"}
MAX_WRITES_PER_TURN = 12
MAX_RUNS_PER_TURN = 8
MAX_READ_CHARS = 80_000
DEFAULT_TIMEOUT = 30


class SandboxError(ValueError):
    pass


class Sandbox:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.writes_this_turn = 0
        self.runs_this_turn = 0

    def reset_turn_counters(self) -> None:
        self.writes_this_turn = 0
        self.runs_this_turn = 0

    def resolve(self, rel: str) -> Path:
        if not rel or rel.startswith("/"):
            raise SandboxError("path must be relative to the sandbox")
        candidate = (self.root / rel).resolve()
        if not str(candidate).startswith(str(self.root)):
            raise SandboxError("path escapes sandbox")
        if candidate.name in BLOCKED_NAMES:
            raise SandboxError(f"blocked filename: {candidate.name}")
        return candidate

    def list_files(self, rel: str = ".") -> list[str]:
        base = self.resolve(rel) if rel not in (".", "") else self.root
        if not base.exists():
            return []
        out: list[str] = []
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in {".git", "__pycache__"}]
            for name in sorted(filenames):
                full = Path(dirpath) / name
                out.append(str(full.relative_to(self.root)))
        return out

    def read_file(self, rel: str) -> str:
        path = self.resolve(rel)
        if not path.is_file():
            raise SandboxError(f"not a file: {rel}")
        text = path.read_text(encoding="utf-8", errors="replace")
        if len(text) > MAX_READ_CHARS:
            return text[:MAX_READ_CHARS] + "\n...[truncated]"
        return text

    def write_file(self, rel: str, content: str) -> str:
        if self.writes_this_turn >= MAX_WRITES_PER_TURN:
            raise SandboxError("write cap reached for this turn")
        path = self.resolve(rel)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        self.writes_this_turn += 1
        return rel

    def edit_file(self, rel: str, old: str, new: str) -> str:
        current = self.read_file(rel)
        if old not in current:
            raise SandboxError("old_string not found")
        if current.count(old) != 1:
            raise SandboxError("old_string is not unique")
        return self.write_file(rel, current.replace(old, new, 1))

    def run(self, argv: list[str], timeout: int = DEFAULT_TIMEOUT) -> dict:
        if self.runs_this_turn >= MAX_RUNS_PER_TURN:
            raise SandboxError("run cap reached for this turn")
        if not argv:
            raise SandboxError("empty command")
        binary = Path(argv[0]).name
        if binary not in ALLOWED_BINARIES:
            raise SandboxError(f"binary not allowed: {binary}")
        self.runs_this_turn += 1
        try:
            proc = subprocess.run(
                argv,
                cwd=self.root,
                capture_output=True,
                text=True,
                timeout=timeout,
                env={
                    "PATH": os.environ.get("PATH", "/usr/bin"),
                    "HOME": str(self.root),
                    "PYTHONDONTWRITEBYTECODE": "1",
                },
            )
            return {
                "argv": argv,
                "exit_code": proc.returncode,
                "stdout": (proc.stdout or "")[-4000:],
                "stderr": (proc.stderr or "")[-4000:],
            }
        except subprocess.TimeoutExpired:
            return {
                "argv": argv,
                "exit_code": 124,
                "stdout": "",
                "stderr": f"timed out after {timeout}s",
            }
