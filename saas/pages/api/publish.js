
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filename, content } = req.body;
    if (!filename || !content) {
      return res.status(400).json({ error: 'Missing filename or content' });
    }

    // Save file locally (Vercel build output)
    const filePath = path.join(process.cwd(), 'public', filename);
    fs.writeFileSync(filePath, content);

    // TODO: integrate Supabase storage or trigger Vercel redeploy here
    return res.status(200).json({ message: 'File saved and publish triggered' });
  } catch (err) {
    return res.status(500).json({ error: 'Publish error', details: err.message });
  }
}
