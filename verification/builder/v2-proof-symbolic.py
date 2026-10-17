#!/usr/bin/env python3
"""Z3-enumerated proof cases; replayed against actual Builder V2 acceptance implementation."""
import json
from z3 import Bool, Solver, Or, sat, is_true
names=['claimed_ok','exit_zero','not_timed_out','command_match','files_complete','after_change']
bits=[Bool(name) for name in names]
solver=Solver()
cases=[]
while solver.check()==sat:
  m=solver.model()
  flags={name:is_true(m.eval(bit,model_completion=True)) for name,bit in zip(names,bits)}
  # Requirement: a result is proven only when all independent host facts agree.
  permitted=all(flags.values())
  cases.append({'flags':flags,'expected':permitted})
  solver.add(Or(*[bit != m.eval(bit,model_completion=True) for bit in bits]))
assert len(cases)==64
print(json.dumps(cases))
