#!/usr/bin/env python3
"""Enumerate satisfiable failure-category combinations using Z3; verify precedence."""
import json
from z3 import Bool, Solver, Or, Not, sat
flags = [Bool(k) for k in ('module', 'syntax', 'assertion', 'runtime')]
solver = Solver()
cases = []
while solver.check() == sat:
    model = solver.model()
    selected = [bool(model.eval(k)) for k in flags]
    expected = next((kind for kind, enabled in zip(
        ('module_resolution','syntax','assertion','runtime'), selected) if enabled), 'unknown')
    cases.append({'flags': selected, 'expected': expected})
    solver.add(Or(*[k != model.eval(k) for k in flags]))
assert len(cases) == 16, f"Expected all 16 category combinations, got {len(cases)}"
print(json.dumps(cases))
