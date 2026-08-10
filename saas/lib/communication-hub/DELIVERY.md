# Delivery semantics

This module is not a catalog-only integration. Each registered transport performs a real provider operation:

- `gmail`: Gmail REST API for send, draft, reply, search and read.
- `microsoft-365`: Microsoft Graph for send, draft, reply, forward, search and read.
- `smtp`: direct SMTP delivery with implicit TLS or STARTTLS and AUTH LOGIN.
- `universal-email-adapter`: executes buyer-configured HTTPS operations with runtime secret substitution.

COS helpers call these transports for outreach messages and owner notifications. Buyer policy is enforced before outbound execution.
