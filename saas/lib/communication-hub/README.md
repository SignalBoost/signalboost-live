# Communication Hub

The Communication Hub is the provider-neutral email execution layer for COS and Marketing & Sales.

Production transports included in this tranche:

- Gmail / Google Workspace through the Gmail API.
- Microsoft 365 / Exchange Online through Microsoft Graph.
- Generic SMTP with TLS/STARTTLS and AUTH LOGIN.
- Universal Email Adapter for buyer-configured HTTPS email APIs.

COS calls the hub rather than provider-specific code. Outbound execution is governed by the buyer's `draft_only`, `approval_required`, or `automatic` policy.

The Universal Email Adapter accepts a buyer-owned JSON mapping of Communication Hub capabilities to HTTPS operations and substitutes secrets at runtime. This lets unsupported REST email systems connect without new SignalBoost source code.
