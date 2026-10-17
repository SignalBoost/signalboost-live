#!/usr/bin/env python3
"""Bounded Z3 model of V2 repair priority over a failing test."""
import json
from z3 import Bool, Solver, Or, sat, is_true
names=['failed_suite','test_named','source_present','unrelated_read','package_conflict','budget_low']
v=[Bool(x) for x in names]
solver=Solver()
cases=[]
while solver.check()==sat:
 m=solver.model()
 d={n:is_true(m.eval(b,model_completion=True)) for n,b in zip(names,v)}
 # Failure-directed context should be injected independent of incidental reads,
 # package conflicts, and the budget when the relevant files exist.
 targeted=d['failed_suite'] and d['test_named'] and d['source_present']
 cases.append({'conditions':d,'must_target':targeted})
 solver.add(Or(*[b != m.eval(b,model_completion=True) for b in v]))
assert len(cases)==64
print(json.dumps(cases))
