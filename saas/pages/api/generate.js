import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";

export default async function handler(req, res) {
  const supabase = createServerSupabaseClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { prompt, language, type } = req.body;

  const output = `AI response for: ${prompt} (${language}, ${type})`;

  return res.status(200).json({
    success: true,
    output,
    user: session.user.email,
  });
}
