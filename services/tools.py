"""Tool schemas COS Builder may call. Execution stays inside the sandbox."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sandbox import Sandbox, SandboxError

TOOL_SCHEMAS = [
    {
        "name": "list_files",
        "description": "List files in the session sandbox.",
        "parameters": {"rel": "string, optional, default ."},
    },
    {
        "name": "read_file",
        "description": "Read a text file from the sandbox.",
        "parameters": {"path": "string"},
    },
    {
        "name": "write_file",
        "description": "Create or overwrite a text file in the sandbox.",
        "parameters": {"path": "string", "content": "string"},
    },
    {
        "name": "edit_file",
        "description": "Replace one unique substring in a sandbox file.",
        "parameters": {"path": "string", "old": "string", "new": "string"},
    },
    {
        "name": "run",
        "description": "Run an allowed command in the sandbox (python3, node, pytest).",
        "parameters": {"argv": "list of strings"},
    },
]


@dataclass
class ToolCall:
    name: str
    args: dict[str, Any]


@dataclass
class ToolResult:
    name: str
    ok: bool
    data: Any


class ToolExecutor:
    def __init__(self, sandbox: Sandbox):
        self.sandbox = sandbox
        self.changed: list[str] = []
        self.commands: list[dict] = []

    def execute(self, call: ToolCall) -> ToolResult:
        try:
            return self._execute(call)
        except SandboxError as exc:
            return ToolResult(name=call.name, ok=False, data={"error": str(exc)})

    def _execute(self, call: ToolCall) -> ToolResult:
        name = call.name
        args = call.args or {}
        if name == "list_files":
            return ToolResult(name, True, self.sandbox.list_files(args.get("rel", ".")))
        if name == "read_file":
            return ToolResult(name, True, self.sandbox.read_file(args["path"]))
        if name == "write_file":
            path = self.sandbox.write_file(args["path"], args["content"])
            self.changed.append(path)
            return ToolResult(name, True, {"wrote": path})
        if name == "edit_file":
            path = self.sandbox.edit_file(args["path"], args["old"], args["new"])
            self.changed.append(path)
            return ToolResult(name, True, {"edited": path})
        if name == "run":
            argv = args.get("argv")
            if isinstance(argv, str):
                argv = argv.split()
            result = self.sandbox.run(list(argv))
            self.commands.append(result)
            return ToolResult(name, True, result)
        return ToolResult(name, False, {"error": f"unknown tool: {name}"})
