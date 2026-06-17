// saas/console-core/executors/index.ts
//
// Side-effect barrel: importing this module runs every executor's
// registerExecutor() call, populating the registry. Import it once from any
// entry point that needs the providers wired (e.g. operatorHost).

import './anthropic'
import './assemblyai'
import './elevenlabs'
import './gemini'
import './github'
import './openai'
import './resend'
import './supabase-marketing'
