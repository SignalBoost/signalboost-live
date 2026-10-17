#!/usr/bin/env python3
"""Model-check Builder V2 progress/verification gates.

Uses Z3 when installed; otherwise exhaustive Boolean state enumeration.
Models admission policy, not the complete production runtime.
"""
import itertools
import json

try:
    from z3 import Bool, Solver, sat, Or, Not, And
except ImportError:
    Bool = Solver = sat = Or = Not = And = None

FIELDS = ("checkpoint", "write_conflict", "content_changed", "tests_failed",
          "required_commands_passed", "tests_satisfied", "model_wait",
          "capacity_requeue")

def policy(state, claim):
    # Never infer success from merely having all files.
    verified = (state["checkpoint"] and state["required_commands_passed"]
                and state["tests_satisfied"] and not state["tests_failed"])
    meaningful_write = state["content_changed"] and not state["write_conflict"]
    progress = meaningful_write or verified
    capacity_only = state["model_wait"] or state["capacity_requeue"]
    can_continue = (state["checkpoint"] and claim < 24 and
                    (capacity_only or claim < 4 or progress))
    return {"verified": verified, "progress": progress, "continue": can_continue}

def iter_states():
    if Solver is None:
        for values in itertools.product((False, True), repeat=len(FIELDS)):
            yield dict(zip(FIELDS, values))
        return
    symbols = [Bool(name) for name in FIELDS]
    solver = Solver()
    while solver.check() == sat:
        model = solver.model()
        values = [bool(model.eval(x, model_completion=True)) for x in symbols]
        yield dict(zip(FIELDS, values))
        solver.add(Or(*[x != model.eval(x, model_completion=True) for x in symbols]))

def main():
    count = 0
    witnesses = {}
    for state in iter_states():
        count += 1
        for claim in (0, 3, 4, 23, 24):
            result = policy(state, claim)
            if state["write_conflict"] and not state["required_commands_passed"] and not state["tests_satisfied"]:
                assert not result["verified"]
            if state["tests_failed"]:
                assert not result["verified"], (state, claim)
            if claim >= 24:
                assert not result["continue"], (state, claim)
            if not state["checkpoint"]:
                assert not result["continue"], (state, claim)
            if claim >= 4 and not result["progress"] and not state["model_wait"] and not state["capacity_requeue"]:
                assert not result["continue"], (state, claim)
            if state["write_conflict"] and not state["required_commands_passed"] and not state["tests_satisfied"]:
                witnesses.setdefault("write_conflict", state)
            if state["tests_failed"] and state["checkpoint"] and claim == 24:
                witnesses.setdefault("exhausted_failed_tests", state)
    assert count == 256, count
    assert "write_conflict" in witnesses and "exhausted_failed_tests" in witnesses
    print(json.dumps({"schema": "itmounts.builder.v2.symbolic.orchestration.v1",
                      "engine": "z3" if Solver else "exhaustive-fallback",
                      "states": count, "claims_checked": 5, "assertions": "passed",
                      "witnesses": witnesses}, sort_keys=True))

if __name__ == "__main__":
    main()
