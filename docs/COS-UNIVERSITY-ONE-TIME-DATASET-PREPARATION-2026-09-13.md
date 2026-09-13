# COS University — One-Time Dataset Preparation

**Date:** September 13, 2026

This increment adds a single-use capability for the already owner-approved CPU dataset-partition step that follows the successful teacher-dataset registration.

The capability is bound to one candidate, one student base model, one immutable Hugging Face dataset revision, a maximum hourly rate of **$0.05/hour**, and a maximum estimated total compute exposure of **$0.015**. It expires within 15 minutes and is atomically claimed before any provider submission.

It cannot authorize student training, cannot expand authority, cannot enable the persistent training dispatch switch, and cannot be replayed after claim or terminal completion. The normal signed training-executor callback remains responsible for registering the resulting train/holdout partition manifests.
