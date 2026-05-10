
// saas/pages/api/intake.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role key for DB writes
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { businessName, industry, description, goals } = req.body;

    if (!businessName || !industry) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert intake data into Supabase table "intake"
    const { data, error } = await supabase
      .from('intake')
      .insert([
        {
          business_name: businessName,
          industry,
          description,
          goals,
          created_at: new Date(),
        },
      ]);

    if (error) {
      return res.status(500).json({ error: 'Database insert failed', details: error.message });
    }

    return res.status(200).json({ message: 'Intake saved successfully', data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
