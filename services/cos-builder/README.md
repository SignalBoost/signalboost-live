# COS Builder v0

COS is the brain. Concierge is the public face.

Coding requests from either face go through one tool loop:

inspect → edit → run → repeat

COS does not rewrite itself. Concierge is not a second developer.

## Pieces

- `classifier.py` — coding vs not-coding
- `sandbox.py` / `tools.py` — list, read, write, edit, run
- `loop.py` — the developer loop
- `policy.py` — default policy (stand-in until live COS tool-calling is wired)
- `llm_policy.py` — drop the real COS model in here
- `builder.py` / `router.py` — both faces call `CosBrain.receive`
- `tests/test_golden.py`

## Run

```bash
cd concierge-builder
python3 -m pytest tests/ -q
python3 demo.py
```
