// Auto-adjust brand memory based on behavioral patterns
const { data: behaviors } = await supabase
  .from("behavioral_memory")
  .select("*")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(10);

if (behaviors && behaviors.length > 0) {
  const recent = behaviors[0];

  const updates: any = {};

  if (recent.tone_shift) updates.brand_tone = recent.tone_shift;
  if (recent.formality_shift) updates.formality_level = recent.formality_shift;
  if (recent.structure_shift) updates.layout_style = recent.structure_shift;

  if (recent.vocabulary_changes?.length > 0) {
    updates.brand_personality = `Prefers vocabulary: ${recent.vocabulary_changes.join(", ")}`;
  }

  await supabase
    .from("brand_profiles")
    .update(updates)
    .eq("user_id", user.id);
}
