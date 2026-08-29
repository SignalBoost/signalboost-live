# Wire live COS into Builder

Concierge stays the face. COS stays the brain.

```
user → Concierge or COS
         → classify
         → if coding: CosBrain.receive
              → ingest attachments into sandbox
              → skip cognitive-skills retrieval
              → policy.decide → tools.execute → repeat
```

## Drop-in

Your COS model must return one of:

```json
{"tool": {"name": "write_file", "args": {"path": "app.py", "content": "..."}}}
```

```json
{"final": "Patched app.py and reran. Output: 5"}
```

Allowed tools: `list_files`, `read_file`, `write_file`, `edit_file`, `run`.

## Code

```python
from factory import choose_policy
from router import CosBrain

class CosModelClient:
    def complete(self, prompt: dict) -> dict:
        # call your COS model with prompt["message"], prompt["tools"], prompt["history"]
        return {"final": "not wired"}

brain = CosBrain(policy=choose_policy(CosModelClient()))
result = brain.receive(user_text, session_id=user_id, face="concierge", attachments=[])
```

If you pass no client, `DefaultDeveloperPolicy` runs the same tools. Golden tests stay green either way.

## Do not

- Point the sandbox at the COS repo
- Send coding turns through the inert skills layer
- Let Concierge invent a second developer
