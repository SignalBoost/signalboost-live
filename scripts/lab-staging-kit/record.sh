#!/usr/bin/env bash
# Manual result for checks done by a person in the LAB interface.
# Usage: ./record.sh CHECK_ID passed|failed|unverified "what you saw" [evidence-file-in-evidence/]
source "$(dirname "$0")/lib/common.sh"; record "$@"
