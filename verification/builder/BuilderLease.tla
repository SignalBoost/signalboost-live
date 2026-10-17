---------------- MODULE BuilderLease ----------------
EXTENDS Integers, TLC

VARIABLES status, generation, owner, verified, committed

vars == <<status, generation, owner, verified, committed>>

Init ==
  /\ status = "queued"
  /\ generation = 0
  /\ owner = 0
  /\ verified = FALSE
  /\ committed = FALSE

Claim ==
  /\ status \in {"queued", "paused"}
  /\ status' = "running"
  /\ generation' = generation + 1
  /\ owner' = generation + 1
  /\ verified' = FALSE
  /\ committed' = FALSE

Verify ==
  /\ status = "running"
  /\ owner = generation
  /\ verified' = TRUE
  /\ UNCHANGED <<status, generation, owner, committed>>

Pause ==
  /\ status = "running"
  /\ status' = "paused"
  /\ UNCHANGED <<generation, owner, verified, committed>>

Expire ==
  /\ status = "running"
  /\ status' = "queued"
  /\ generation' = generation + 1
  /\ owner' = 0
  /\ verified' = FALSE
  /\ committed' = FALSE

Finish ==
  /\ status = "running"
  /\ owner = generation
  /\ verified
  /\ status' = "succeeded"
  /\ committed' = TRUE
  /\ UNCHANGED <<generation, owner, verified>>

Next == Claim \/ Verify \/ Pause \/ Expire \/ Finish

Safety ==
  /\ (committed => (status = "succeeded" /\ verified /\ owner = generation))
  /\ (status = "succeeded" => committed)

Spec == Init /\ [][Next]_vars
=========================================================
