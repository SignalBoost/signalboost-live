#!/usr/bin/env python3
"""Enumerate LAB job reservation and recovery fault paths using Z3 (no provider calls)."""
import json
from z3 import Bool, Int, Solver, Or, sat

reserve_failure = Bool("reserve_failure")
submit_failure = Bool("submit_failure")
lookup = Int("lookup")  # 0=not found, 1=found, 2=lookup error
attach_failure = Bool("attach_failure")
release_failure = Bool("release_failure")
symbols = (reserve_failure, submit_failure, lookup, attach_failure, release_failure)
solver = Solver()
solver.add(lookup >= 0, lookup <= 2)
cases = []
while solver.check() == sat:
    model = solver.model()
    result = [model.eval(x, model_completion=True) for x in symbols]
    reserve, submit, lookup_value, attach, release = (
        bool(result[0]), bool(result[1]), result[2].as_long(), bool(result[3]), bool(result[4])
    )
    if reserve:
        status, events = "reservation_failed", ["reserve"]
    elif not submit:
        status, events = ("submitted_unattached" if attach else "submitted"), ["reserve", "submit", "attach"]
    elif lookup_value == 2:
        status, events = "unknown", ["reserve", "submit", "lookup"]
    elif lookup_value == 0:
        status, events = "not_submitted", ["reserve", "submit", "lookup", "release"]
    else:
        status, events = ("submitted_unattached" if attach else "submitted"), ["reserve", "submit", "lookup", "attach"]
    cases.append({
        "reserveFailure": reserve, "submitFailure": submit,
        "lookup": ("absent", "found", "error")[lookup_value],
        "attachFailure": attach, "releaseFailure": release,
        "expectedStatus": status, "expectedEvents": events,
    })
    solver.add(Or(*[x != y for x, y in zip(symbols, result)]))

assert len(cases) == 48, f"expected 48 paths, got {len(cases)}"
print(json.dumps({"schema": "itmounts.lab.z3.job_lifecycle.v1", "cases": cases}))
