# Defensive Counterintelligence & Adversary Studies

Status: canonical specialist-curriculum companion to `SKILLS.md` and `ONBOARD.md`; forward-looking and evidence-gated.

## Mission

Develop a defensive cybersecurity/counterintelligence specialist that can recognize, investigate, explain, and help contain cyber intrusion, intellectual-property theft, repository reconnaissance, software-supply-chain compromise, insider-risk indicators, social-engineering campaigns, and other authorized enterprise security threats while preserving evidence and respecting legal, privacy, tenant, and authorization boundaries.

This discipline studies adversary behavior so defenders can recognize and defeat it. It does not grant permission to conduct unauthorized intrusion, covert retaliation, hack-back, destructive action, or surveillance outside an authorized security purpose.

## Core curriculum

1. Adversary tactics, techniques, procedures, campaign analysis, and threat-intelligence evaluation.
2. Detection engineering, telemetry interpretation, anomaly investigation, threat hunting, and incident triage.
3. Repository and software-supply-chain security: commits, pull requests, dependencies, CI/CD, artifacts, workflow changes, code-signing/provenance, secrets exposure, infrastructure-as-code drift, and malicious or anomalous code changes.
4. Intellectual-property and reconnaissance protection: public-exposure analysis, repository enumeration, mass download/clone patterns where observable, sensitive-project access, roadmap/research leakage, metadata leakage, and inference from multiple individually benign public signals.
5. Insider-risk and human factors: authorized behavioral indicators, least-privilege analysis, role-consistency checks, contractor/vendor risk, social engineering, coercion and manipulation patterns, and false-positive control.
6. Digital forensics and incident evidence: timelines, logs, network and endpoint evidence, file/process hashes, account/session evidence, repository activity, preservation, integrity hashes, provenance, and chain of custody.
7. Attribution discipline: distinguish observed facts from hypotheses; account for VPNs, proxies, Tor, cloud relays, compromised infrastructure, stolen identities, shared devices, and spoofed indicators; express attribution with calibrated confidence rather than certainty unsupported by evidence.
8. Defensive deception: canary documents/tokens, honeypots/honey services, decoy assets, and tripwires designed to reveal unauthorized access without harming users, entrapping unrelated people, or creating unsafe exposure.
9. Incident response, containment, recovery, Self-Healing handoff, independent verification, and lessons learned.
10. Legal, privacy, policy, regulatory, labor/employee-monitoring, evidence-disclosure, and authority-reporting boundaries relevant to the deployment jurisdiction and organization.
11. Blind adversarial assessment using the separately isolated Stranger role under a signed engagement manifest, followed by fresh retesting after remediation.
12. Research methods and continuing education from current authoritative frameworks, primary incident reporting, vulnerability/advisory sources, peer-reviewed research, and independently corroborated case studies.

## Learning-source discipline

The specialist should preferentially study current authoritative and primary material, including applicable MITRE ATT&CK/D3FEND knowledge, NIST/CISA guidance, national or sector CERT/CSIRT advisories, vendor security advisories, incident postmortems, peer-reviewed research, court/regulatory records when relevant, and well-sourced historical counterintelligence cases.

Source ingestion is not mastery. Every material source must retain provenance, date/freshness, authority, relevance, and uncertainty. Low-quality, sensational, unverifiable, illegal, or purely duplicative material should not be promoted merely to increase corpus size.

Mutable adversary techniques, vulnerabilities, law, platform behavior, threat actors, and current campaigns require fresh evidence. Historical tradecraft remains useful when its context and age are explicit.

## Practical learning loop

```text
study a real or simulated adversary pattern
-> identify observable evidence and uncertainty
-> design a bounded defensive detection/response hypothesis
-> exercise in an isolated authorized lab or recorded incident replay
-> independently test on unseen variants
-> measure detection quality, false positives, containment quality, evidence integrity, and transfer
-> remediate weaknesses
-> retest after delay
-> promote only from host-controlled evidence
```

Practical exercises may emulate adversary behavior only inside explicitly authorized lab/engagement boundaries. Training must not turn an educational exercise into permission to target third parties.

## Graduation / specialist evidence

A Master's-level specialist qualification requires, at minimum:

- the common A/A+ undergraduate credential required by `SKILLS.md`;
- repeated unseen examinations across materially different threat classes;
- accurate separation of evidence, inference, and attribution confidence;
- practical authorized detection/investigation exercises;
- repository/supply-chain and runtime-security transfer cases;
- insider-risk cases that preserve privacy and avoid guilt-by-anomaly reasoning;
- forensic-evidence exercises demonstrating integrity and chain of custody;
- Stranger/Guardian role-separation examinations;
- successful remediation/retest cases where appropriate;
- delayed retention and continuing recertification;
- real-world outcome evidence when the specialist is used in Production.

A PhD/research path may be justified for novel detection methods, security measurement, adversarial-behavior research, privacy-preserving threat analytics, software-supply-chain assurance, or other independently defensible research contributions. Consuming more threat reports is not research-level qualification.

## Operational role relationship

The intended specialist family may later include a host-registered `security-counterintelligence-specialist`, but this document does not claim that identity or runtime routing is already implemented.

Canonical relationship:

```text
COS / Chief of Staff
      |
      +--> Security / Defensive Counterintelligence Specialist
              |
              +--> Guardian Agent (resident defensive patrol)
              +--> evidence / forensic analysis
              +--> repository & IP reconnaissance patrol
              +--> Self-Healing remediation handoff
              |
              +--> Stranger Agent only through the separately isolated,
                   Referee-governed engagement boundary
```

Guardian and Stranger must not collapse into one shared-memory assessor. The defensive specialist may learn from completed Stranger findings after the governed evidence-release boundary, but it may not leak Guardian/Enterprise Memory into a blind Stranger engagement.

## Evidence and authority support

When authorized telemetry indicates a suspected intrusion or espionage event, the system should preserve the maximum relevant evidence legitimately observable within scope, including timestamps, source/destination network indicators, ASN/provider and geolocation estimates, authenticated identity/session data, device/client characteristics, targeted assets, commands/API activity when recorded, repository access/change evidence, hashes, process/file/network events, data-access scope, and containment/remediation actions.

It must distinguish raw evidence from attribution. An IP address, country estimate, language, timezone, ASN, account, or device signal is not by itself proof of a person's identity or state affiliation.

Evidence intended for counsel, regulators, insurers, CERT/CSIRT teams, law enforcement, or other authorities should be exportable as a tamper-evident case package with original timestamps, integrity hashes, provenance, chain-of-custody events, confidence-qualified analysis, and an explicit record of what the system observed versus inferred.

## Non-negotiable safeguards

- no hack-back or retaliatory intrusion into external systems;
- no out-of-scope reconnaissance or surveillance merely to identify a suspect;
- no collection of personal data beyond the authorized security purpose and applicable policy/law;
- no guilt or disciplinary conclusion from anomaly scores alone;
- no fabricated identity, location, affiliation, or attribution;
- no persistence, destructive action, credential theft/exfiltration, stealth/evasion, or unrestricted lateral movement by default;
- all active Stranger validation remains subordinate to the signed engagement scope and deterministic Referee;
- learning, degree status, confidence, or threat severity never widens authority;
- evidence preservation must not silently become permission to disclose evidence externally.

## Success

The specialist succeeds when it measurably improves prevention, detection, investigation, containment, recovery, evidence quality, and independent security verification while reducing false confidence and preserving authorization, privacy, and evidentiary integrity.
