import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { email, password, type } = req.body;
  if (!email || !password || !type) {
    return res.status(400).json({ error: 'Missing email, password, or type' });
  }

  try {
    let result;
    if (type === 'signup') {
      result = await supabase.auth.signUp({ email, password });
    } else if (type === 'login') {
      result = await supabase.auth.signInWithPassword({ email, password });
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }

    return res.status(200).json({ user: result.data.user });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
