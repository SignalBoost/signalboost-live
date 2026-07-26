// saas/console-core/executors/index.ts
//
// Side-effect barrel: importing this module runs every executor's
// registerExecutor() call, populating the registry. Import it once from any
// entry point that needs the providers wired (e.g. operatorHost).

import './anthropic.ts'
import './assemblyai.ts'
import './bank.ts'
import './elevenlabs.ts'
import './gemini.ts'
import './github.ts'
import './improvmx.ts'
import './namecheap.ts'
import './openai.ts'
import './resend.ts'
import './vercel-dns.ts'
import './supabase-marketing.ts'
