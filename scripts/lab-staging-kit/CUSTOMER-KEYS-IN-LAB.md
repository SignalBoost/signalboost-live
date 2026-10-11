# Connecting the test customer's own keys in LAB

Do this as **disposable customer A**, in a private browser window. Never paste keys into chat, tickets, email or this kit.
Use keys from an account that belongs to the test customer. **Do not use the platform owner's keys.** They would charge the owner for
customer work, and the test would prove nothing.

## Before you start (test customer's own accounts)
1. **Teacher key:** in the test customer's account with the chosen provider (same provider and model as the verified price), create a new
   API key just for this test. Set a low spending limit on that provider account, if the provider supports one.
2. **Hugging Face token:** in the test customer's Hugging Face account → Settings → Access Tokens → *Create new token* →
   **Fine-grained**. Allow: *Jobs* (start and manage), write access to repositories in the customer's own namespace, read access to the
   base model. The account needs billing enabled for Jobs. Give it a clear name, e.g. `lab-staging-test`.

## In LAB
1. Sign in at `<STAGING_APP_URL>` with customer A's email and password.
2. Open **Dashboard → University telemetry**. Scroll to the **Training** panel under the experiment panel.
3. **Connect provider → Hugging Face:** give it a label and paste the HF token in the key box. Save. The box clears and only the label
   is shown afterwards.
4. **Connect provider → teacher (e.g. OpenAI / Anthropic):** label, paste key, save.
5. Create one experiment (this is the **artifact** under test). Copy its ID into `EXPERIMENT_A`, then record:
   `./record.sh ARTIFACT_CREATED passed "Experiment created in LAB as customer A"`.
6. Check the panel shows both connections by label only, with no part of any key visible. Then record:
   `./record.sh UI_KEYS_NOT_SHOWN passed "Labels only, no key characters shown"`.

Then run `./03-free-checks.sh`.

## After the test
Revoke both keys at the provider and on Hugging Face, even though `04-paid-run.sh` already revoked the teacher key inside LAB.
