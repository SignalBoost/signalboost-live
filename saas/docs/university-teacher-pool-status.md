# Teacher pool rollout status

The enterprise provider abstraction is implemented. Qwen/DeepSeek use the governed Hugging Face/local-executor class; OpenAI, Anthropic/Claude, xAI/Grok, and buyer custom endpoints use hosted/custom adapter contracts. All providers require explicit enablement, buyer-owned credentials, provenance, and bounded authorization.

Activation of a concrete provider remains subject to its adapter-ready gate and model/license policy. Unknown licenses fail closed. Independent evaluation and graduation criteria remain provider-independent.
