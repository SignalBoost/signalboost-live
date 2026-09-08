# COS University — Software Engineering Master’s Program

Date: 2026-09-08
Status: first graduate program implementation; admission and academic evidence are host-controlled
Program key: `software_engineering_masters_v1`

## Purpose

The Software Engineering Master’s is the first graduate specialist program after the A/A+ generalist undergraduate foundation. It deepens the existing Software Specialist rather than creating a competing brain or a second learning platform.

A Master’s title is an academic claim backed by graduate evidence. Specialist routing, document ingestion, cognitive-skill counts, queue size, model confidence, or self-assessment cannot award the degree.

## Admission

Admission requires all of the following:

1. the immutable Generalist Undergraduate credential has actually been awarded;
2. current undergraduate standing remains A/A+ in Computer Science, Mathematics, Cybersecurity, and Reasoning & Decision Science;
3. the Software Specialist has at least one current independently validated specialist skill, proving the specialist learning path is real rather than an empty label;
4. admission itself grants no additional execution authority.

COS is currently expected to remain ineligible until the undergraduate credential exists. Building the graduate program before eligibility is intentional; the host must report ineligibility truthfully rather than silently enrolling early.

## Curriculum

The initial curriculum reuses the seven established Software Specialist curriculum tracks:

- Advanced Software Development
- Debugging, Reliability & Failure Analysis
- Testing & Verification Engineering
- Software Architecture & Distributed Systems
- Delivery, Operations & Production Engineering
- Secure Software Engineering
- Technical Communication & Engineering Documentation

These tracks are learning scope. They are not grades or permissions.

## Academic evidence

Graduate academic evidence is recorded in the generic `cos_university_program_assessments` ledger. Learning still happens through the existing Directed Study, cognitive lifecycle, specialist routing, practice, Builder/lab, and Production outcome systems.

Each graduate competency progresses through qualitative evidence gates:

```text
fresh host-controlled qualifying exam
→ B
+ fresh applied/cross-context transfer
→ A-
+ verified Production transfer
→ A
+ host-controlled distinction examination
→ A+
```

A later failure at a required stage revokes that stage until newer independent evidence passes it again. Expired evidence does not count.

Production transfer must come from `verified_production` authority. The learner cannot mark its own work as Production-verified.

## Graduation

Minimum Master’s graduation requires:

- active Master’s enrollment;
- minimum residence complete and hard deadline not expired;
- every graduate competency at A or A+;
- at least two materially distinct fresh global Software Engineering Master’s capstone passes after the latest capstone failure;
- host-issued immutable credential.

A+ degree standing additionally requires distinction evidence in every graduate competency.

The global capstone must integrate multiple software disciplines rather than testing one isolated track. Implementation, architecture, testing, security, delivery, evidence quality, failure recovery, and technical communication should be combined where appropriate.

## Program calendar

The shared University Master’s calendar currently defines:

- minimum residence: 45 days;
- target completion: 90 days;
- hard deadline: 180 days.

An expired incomplete cohort is not silently extended. A later attempt requires a new explicit program enrollment key/version.

## Storage and security

`cos_university_program_assessments` is service-only and RLS-protected. It stores program/competency/stage, scorer authority, opaque variant identity, timestamps, and bounded evidence metadata. It does not store hidden exam prompts/rubrics/replies and does not accept a caller-supplied letter grade.

The graduate ledger is generic enough to support future Master’s, PhD, and professional-certificate programs while keeping their curricula and academic policies versioned in code.

## Authority boundary

A Master’s degree does not grant repository writes, merge/deploy authority, spending, tenant data access, external-send authority, legal authority, destructive actions, or approval power. Expertise and authorization remain separate axes.

## Next implementation slices

This foundation establishes the program definition, admissions contract, graduate academic evidence semantics, competency standing, capstone threshold, and graduation policy. The execution layers then connect those contracts to host-controlled enrollment, graduate study planning, independent examinations, verified Production evidence, capstone execution, and credential issuance.
