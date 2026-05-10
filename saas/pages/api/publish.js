
// saas/pages/api/publish.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role key for write access
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({ error: 'Missing filename or content' });
    }

    // Save file into Supabase storage bucket
    const { error: uploadError } = await supabase.storage
      .from('sites')
      .upload(filename, Buffer.from(content), {
        contentType: 'text/html',
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ error: 'Upload failed', details: uploadError.message });
    }

    // Trigger Vercel deploy hook
    const vercelResponse = await fetch(process.env.VERCEL_DEPLOY_HOOK_URL, {
      method: 'POST',
    });

    if (!vercelResponse.ok) {
      return res.status(500).json({ error: 'Deploy trigger failed' });
    }

    return res.status(200).json({ message: 'File published and deploy triggered' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
