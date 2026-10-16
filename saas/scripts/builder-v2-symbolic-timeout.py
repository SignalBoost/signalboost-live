#!/usr/bin/env python3
"""Enumerate every V2 model-timeout continuation state with Z3, emit replay cases."""
import json
from z3 import Bool, Or, Solver, sat

unavailable = Bool('unavailable')
progress = Bool('progress')
deadline = Bool('deadline')
checkpoint = Bool('checkpoint')
symbols = [unavailable, progress, deadline, checkpoint]
solver = Solver()
cases = []
while solver.check() == sat:
    model = solver.model()
    values = [bool(model.eval(v, model_completion=True)) for v in symbols]
    u, p, d, c = values
    outcome = 'continue' if not u else ('fail' if not c else ('pause' if p or d else 'fail'))
    cases.append(dict(unavailable=u, madeProgress=p, deadline=d, checkpointPresent=c, expected=outcome))
    solver.add(Or(*[v != model.eval(v, model_completion=True) for v in symbols]))
assert len(cases) == 16, len(cases)
assert all(c['expected'] != 'pause' or c['checkpointPresent'] for c in cases)
assert all(not c['unavailable'] or c['expected'] != 'continue' for c in cases)
print(json.dumps({'schema':'itmounts.builder.v2.z3.timeout.v1','cases':cases}))
