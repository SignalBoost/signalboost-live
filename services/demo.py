#!/usr/bin/env python3
"""Smoke the three golden coding paths through COS, via Concierge face."""

from router import CosBrain


def main() -> None:
    brain = CosBrain()
    cases = [
        (
            "debug",
            "Debug this Python function. I get NameError: name 'c' is not defined.\n"
            "```python\n"
            "def add(a, b):\n"
            "    return a + c\n"
            "```",
        ),
        (
            "script",
            "Write a small Python script that prints a 3-item checklist and run it.",
        ),
        (
            "html",
            "Make a simple portable HTML checklist page I can download.",
        ),
        (
            "self",
            "Rewrite COS and change the promotion pipeline in Concierge internals.",
        ),
        (
            "chat",
            "What time is the next train to the airport?",
        ),
    ]
    for session_id, message in cases:
        result = brain.receive(message, session_id=session_id, face="concierge")
        print("=" * 72)
        print(f"session={session_id} coding={result.is_coding} "
              f"by={result.handled_by} refuse={result.refused_self_modify}")
        print(result.output or result.summary)
        print()


if __name__ == "__main__":
    main()
