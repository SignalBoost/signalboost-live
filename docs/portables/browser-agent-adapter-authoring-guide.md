# Portable Browser Adapter Authoring Guide

1. Implement one or more provider-neutral ports without exposing vendor clients, browser objects, credentials, cookies, or WebSocket addresses.
2. Create and freeze a descriptor; it must accurately declare only mapped ports and capabilities.
3. Register the descriptor in host composition.
4. Validate it against the portable manifest.
5. Run contract and security tests.
6. Run tenant-isolation, credential-isolation, and evidence-redaction reviews.
7. Explicitly activate it only in buyer host composition after approvals.

A new adapter never changes the portable coordinator. Descriptors and placeholders are not integration claims: host adapter required, not installed, not activated, and not production enabled until a real host implementation is reviewed and tested.
