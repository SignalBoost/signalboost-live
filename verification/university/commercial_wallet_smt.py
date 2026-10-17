#!/usr/bin/env python3
"""SMT-generated University commercial wallet cases, never payment execution."""
import json
from z3 import Ints, Solver, And, Or, sat, unsat

grant = 100
reserved, captured, released, reversed_ = Ints("reserved captured released reversed")
base = [reserved >= 0, captured >= 0, released >= 0, reversed_ >= 0]
valid = base + [captured + released <= reserved, reserved + reversed_ - released <= grant]
available = grant - reserved + released - reversed_
held = reserved - captured - released

for label, bad in [("negative_available", available < 0), ("negative_held", held < 0)]:
    solver = Solver()
    solver.add(*valid, bad)
    assert solver.check() == unsat, f"Commercial accounting invariant violated: {label}"

cases = []
for label, conditions, expected in [
    ("partial_capture", [reserved == 60, captured == 40, released == 20, reversed_ == 10], True),
    ("all_reserved", [reserved == 100, captured == 100, released == 0, reversed_ == 0], True),
    ("overspend", [reserved == 101, captured == 0, released == 0, reversed_ == 0], False),
    ("overcapture", [reserved == 10, captured == 11, released == 0, reversed_ == 0], False),
    ("overrelease", [reserved == 10, captured == 0, released == 11, reversed_ == 0], False),
    ("overreversal", [reserved == 0, captured == 0, released == 0, reversed_ == 101], False),
]:
    solver = Solver()
    solver.add(*base, *conditions)
    assert solver.check() == sat, label
    m = solver.model()
    values = [m.eval(x).as_long() for x in (reserved, captured, released, reversed_)]
    cases.append({"name": label, "values": values, "valid": expected})
print(json.dumps({"proof": "UNSAT for negative balances under specified constraints", "cases": cases}))
