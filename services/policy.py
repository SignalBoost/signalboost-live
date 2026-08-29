"""Default developer policy.

This is a stand-in for the live COS model. It only speaks through tools.
Swap in LlmPolicy when COS tool-calling is wired.
"""

from __future__ import annotations

import re

from loop import PolicyDecision
from tools import ToolCall, ToolResult

FENCE_RE = re.compile(r"```(?:\w+)?\n(.*?)```", re.DOTALL)


def extract_fenced(message: str) -> str | None:
    match = FENCE_RE.search(message or "")
    if not match:
        return None
    return match.group(1).strip() + "\n"


class DefaultDeveloperPolicy:
    """Heuristic policy that still uses the real tool loop."""

    def decide(
        self,
        message: str,
        history: list[ToolResult],
        files: list[str],
    ) -> PolicyDecision:
        lower = (message or "").lower()
        if "html" in lower or "portable" in lower or "page" in lower:
            return self._html(history)
        if any(k in lower for k in ("debug", "traceback", "typeerror", "nameerror")):
            return self._debug(message, history)
        return self._script(message, history)

    def _html(self, history: list[ToolResult]) -> PolicyDecision:
        if not any(h.name == "write_file" and h.ok for h in history):
            return PolicyDecision(
                call=ToolCall(
                    "write_file",
                    {"path": "index.html", "content": PORTABLE_HTML},
                )
            )
        return PolicyDecision(
            final=True,
            summary="Wrote a portable index.html you can download and open in a browser.",
        )

    def _debug(self, message: str, history: list[ToolResult]) -> PolicyDecision:
        writes = [h for h in history if h.name == "write_file" and h.ok]
        runs = [h for h in history if h.name == "run" and h.ok]
        edits = [h for h in history if h.name == "edit_file"]

        if not writes:
            body = extract_fenced(message) or DEFAULT_BROKEN
            if "if __name__" not in body:
                body = body.rstrip() + "\n\nif __name__ == '__main__':\n    print(add(2, 3))\n"
            return PolicyDecision(
                call=ToolCall("write_file", {"path": "app.py", "content": body})
            )
        if not runs:
            return PolicyDecision(call=ToolCall("run", {"argv": ["python3", "app.py"]}))
        last_run = runs[-1].data or {}
        if last_run.get("exit_code") == 0:
            return PolicyDecision(
                final=True,
                summary="Reproduced the run and the code succeeds.",
            )
        if not edits:
            return PolicyDecision(
                call=ToolCall(
                    "edit_file",
                    {"path": "app.py", "old": "a + c", "new": "a + b"},
                )
            )
        if len(runs) < 2:
            return PolicyDecision(call=ToolCall("run", {"argv": ["python3", "app.py"]}))
        if (runs[-1].data or {}).get("exit_code") == 0:
            return PolicyDecision(
                final=True,
                summary="Reproduced the error, patched app.py, and reran.",
            )
        return PolicyDecision(
            final=True,
            summary="Reproduced the failure. Paste the full file and I will patch it.",
        )

    def _script(self, message: str, history: list[ToolResult]) -> PolicyDecision:
        if not any(h.name == "write_file" and h.ok for h in history):
            content = CHECKLIST_SCRIPT if "checklist" in message.lower() else GENERIC_SCRIPT
            return PolicyDecision(
                call=ToolCall("write_file", {"path": "app.py", "content": content})
            )
        if not any(h.name == "run" and h.ok for h in history):
            return PolicyDecision(call=ToolCall("run", {"argv": ["python3", "app.py"]}))
        return PolicyDecision(
            final=True,
            summary="Wrote app.py in the COS sandbox and ran it.",
        )


DEFAULT_BROKEN = "def add(a, b):\n    return a + c\n"

GENERIC_SCRIPT = (
    "def main():\n"
    "    print('ok')\n"
    "    print(2 + 3)\n"
    "\n"
    "if __name__ == '__main__':\n"
    "    main()\n"
)

CHECKLIST_SCRIPT = (
    "items = ['ship classifier', 'wire COS builder', 'skip inert skills']\n"
    "for i, item in enumerate(items, 1):\n"
    "    print(f'{i}. {item}')\n"
)

PORTABLE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Portable page</title>
  <style>
    body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
    button, input { font: inherit; }
  </style>
</head>
<body>
  <h1>Checklist</h1>
  <p>Open this file locally. No server required.</p>
  <input id="item" placeholder="Add item">
  <button id="add">Add</button>
  <ul id="list"></ul>
  <script>
    const list = document.getElementById('list');
    document.getElementById('add').onclick = () => {
      const value = document.getElementById('item').value.trim();
      if (!value) return;
      const li = document.createElement('li');
      li.textContent = value;
      list.appendChild(li);
      document.getElementById('item').value = '';
    };
  </script>
</body>
</html>
"""
