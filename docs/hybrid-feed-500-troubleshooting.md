# Hybrid Feed `/api/feed` HTTP 500 Troubleshooting

This runbook is for the production error shown in the UI:

- `Feed failed: /api/feed -> HTTP 500`
- `Could not load feed data.`

## Fast triage (5 minutes)

1. Confirm whether the API itself is down:
   - `curl -i https://<your-domain>/api/feed`
2. Check the application logs around the request timestamp.
3. Identify which upstream source failed (YouTube, Reddit, Instagram, Facebook).
4. Verify required API keys/secrets are present in runtime environment.
5. Temporarily disable failed provider(s) so other feeds can still render.

## Typical root causes

- Missing or expired API key/token.
- Rate limit or quota exhaustion from one upstream platform.
- Timeout to one provider causing unhandled exception.
- Response schema change from a provider.
- Server-side JSON parsing error on malformed/empty upstream payload.

## Recommended server-side hardening

### 1) Degrade gracefully per provider

Avoid failing the entire endpoint when one source breaks.

- Wrap each provider fetch in its own `try/catch`.
- Return partial data for healthy providers.
- Include an `errors` array with provider-specific failures.

### 2) Add request timeout and retries

- Timeout each provider call (e.g., 5-10s).
- Retry transient failures (`429`, `502`, `503`, `504`) with exponential backoff.

### 3) Validate configuration on startup

- On boot, assert that required env vars are present.
- Log a clear startup error if keys are missing.

### 4) Return safe error payloads

Use a consistent JSON error shape:

```json
{
  "ok": false,
  "message": "Hybrid feed unavailable",
  "errors": [
    { "provider": "youtube", "message": "quota exceeded" }
  ]
}
```

### 5) Improve observability

- Add structured logs with request id and provider name.
- Emit counters: `feed_success`, `feed_partial`, `feed_failed`.
- Alert on sustained `500` spikes.

## Front-end mitigation

- Keep the existing failure message, but also show partial provider results when available.
- Add a retry button with short backoff.
- Surface provider-level status (e.g., `Reddit temporarily unavailable`).

## Suggested incident checklist

- [ ] Reproduce with `curl`.
- [ ] Capture failing stack trace.
- [ ] Identify broken provider.
- [ ] Rotate/refresh keys if auth error.
- [ ] Patch endpoint to return partial feed data.
- [ ] Confirm UI can render partial data.
- [ ] Add postmortem notes.

## Example response contract for partial success

```json
{
  "ok": true,
  "items": [/* merged feed items */],
  "errors": [
    { "provider": "instagram", "message": "timeout" }
  ]
}
```
