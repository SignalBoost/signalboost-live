#!/usr/bin/env python3
"""Z3-backed path exploration for the real customer LAB artifact callback.

Outputs every Boolean combination of six independent failure predicates.
The generated JSON is replayed against production TypeScript in CI; no provider work.
"""
import json
from z3 import Bool, Solver, Or, Not, sat

fields = ("candidate_ok", "namespace_ok", "stage_ok", "account_ok", "hash_ok", "unique_ok")
variables = [Bool(name) for name in fields]
solver = Solver()
cases = []
while solver.check() == sat:
    model = solver.model()
    values = [bool(model.eval(v, model_completion=True)) for v in variables]
    case = dict(zip(fields, values))
    case["expected"] = "complete" if all(values) else "reject"
    cases.append(case)
    solver.add(Or(*[v != model.eval(v, model_completion=True) for v in variables]))

assert len(cases) == 64, "incomplete model enumeration"
print(json.dumps({"schema": "itmounts.lab.z3.artifact_callback.v1", "cases": cases}))
