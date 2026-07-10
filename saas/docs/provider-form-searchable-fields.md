# Provider template searchable-field standard

All provider action forms must minimize manual entry and prevent invalid values.

## Rules

1. Finite provider values must use a searchable dropdown/combobox, never a plain text input or native non-searchable select.
2. Provider resources (domains, projects, deployments, environment variables, audiences, aliases, API keys, records, repositories, branches, etc.) must be loaded from the provider API using `remote_select`.
3. Fixed enums must expose explicit options. Example: Vercel environment target = `production`, `preview`, `development`, or `all` where supported.
4. Free-form values that cannot be discovered (new secret values, email body, DNS record value, new alias name, etc.) remain editable inputs, but should provide validation, examples, and autocomplete suggestions when safe.
5. Secret fields must never be populated from provider search results or exposed in dropdowns.
6. IDs shown to users must include a human-readable label and retain the provider ID as the submitted value.
7. Destructive actions must select an existing live resource rather than require users to type its ID.
8. Search must be case-insensitive and support label, ID, and relevant metadata.
9. Empty, loading, and provider-error states must be explicit; do not silently fall back to an unrestricted text field for destructive actions.

## Immediate correction

The Vercel target field shown as `TARGET (PRODUCTION/PREVIEW/DEVELOPMENT)` must render as a searchable fixed-option combobox with:

- Production (`production`)
- Preview (`preview`)
- Development (`development`)
- All Environments (`all`) only for actions supported by the Vercel endpoint

This standard applies to every Hub provider template, including ImprovMX and Resend.
