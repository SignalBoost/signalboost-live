// saas/lib/elevenlabs/voices.ts
// Curated voice list covering all 5 supported languages.
// All voices use the Eleven Multilingual v2 model.
//
// IMPORTANT: voice_id values are from ElevenLabs' default library.
// Re-audition with native speakers before launch — voice quality
// in non-English languages varies. To swap a voice, replace the
// `id` field with a new voice_id from:
//   https://elevenlabs.io/app/voice-library

export type VoiceLocale =
  | "en"
  | "pt-BR"
  | "pt-PT"
  | "es-LATAM"
  | "es-ES"
  | "pl"
  | "ru";

export type VoiceGender = "male" | "female";

export interface CuratedVoice {
  id: string;
  name: string;
  locale: VoiceLocale;
  gender: VoiceGender;
  /** Translation key for the description, e.g. "voice.sarah.description" */
  descriptionKey: string;
  /** English fallback if no translation exists for the description */
  descriptionFallback: string;
}

export const CURATED_VOICES: CuratedVoice[] = [
  // English
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    locale: "en",
    gender: "female",
    descriptionKey: "voice.sarah.description",
    descriptionFallback: "Warm and clear — ideal for narration",
  },
  {
    id: "TX3LPaxmHKxFdv7VOQHJ",
    name: "Liam",
    locale: "en",
    gender: "male",
    descriptionKey: "voice.liam.description",
    descriptionFallback: "Conversational and approachable",
  },

  // Portuguese-Brazilian
  {
    id: "XB0fDUnXU5powFXDhCwa",
    name: "Charlotte",
    locale: "pt-BR",
    gender: "female",
    descriptionKey: "voice.charlotte.description",
    descriptionFallback: "Energetic and engaging",
  },
  {
    id: "iP95p4xoKVk53GoZ742B",
    name: "Chris",
    locale: "pt-BR",
    gender: "male",
    descriptionKey: "voice.chris.description",
    descriptionFallback: "Warm and narrative",
  },

  // Portuguese-European
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice",
    locale: "pt-PT",
    gender: "female",
    descriptionKey: "voice.alice.description",
    descriptionFallback: "Welcoming and refined",
  },
  {
    id: "pqHfZKP75CvOlQylNhV4",
    name: "Bill",
    locale: "pt-PT",
    gender: "male",
    descriptionKey: "voice.bill.description",
    descriptionFallback: "Firm and professional",
  },

  // Spanish-LATAM
  {
    id: "9BWtsMINqrJLrRacOk9x",
    name: "Aria",
    locale: "es-LATAM",
    gender: "female",
    descriptionKey: "voice.aria.description",
    descriptionFallback: "Energetic and dynamic",
  },
  {
    id: "cgSgspJ2msm6clMCkdW9",
    name: "Jessica",
    locale: "es-LATAM",
    gender: "female",
    descriptionKey: "voice.jessica.description",
    descriptionFallback: "Conversational and close",
  },

  // Spanish-European
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    locale: "es-ES",
    gender: "male",
    descriptionKey: "voice.george.description",
    descriptionFallback: "Authoritative and elegant",
  },
  {
    id: "FGY2WhTYpPnrIDTdsKH5",
    name: "Laura",
    locale: "es-ES",
    gender: "female",
    descriptionKey: "voice.laura.description",
    descriptionFallback: "Refined and professional",
  },

  // Polish — placeholder defaults; validate with a Polish speaker before launch
  {
    id: "ThT5KcBeYPX3keUQqHPh",
    name: "Dorothy",
    locale: "pl",
    gender: "female",
    descriptionKey: "voice.dorothy.description",
    descriptionFallback: "Pleasant and clear",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    locale: "pl",
    gender: "male",
    descriptionKey: "voice.daniel.description",
    descriptionFallback: "Confident and clear",
  },

  // Russian — same: validate with a Russian speaker before launch
  {
    id: "z9fAnlkpzviPz146aGWa",
    name: "Glinda",
    locale: "ru",
    gender: "female",
    descriptionKey: "voice.glinda.description",
    descriptionFallback: "Strong and resonant",
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    locale: "ru",
    gender: "male",
    descriptionKey: "voice.josh.description",
    descriptionFallback: "Deep and steady",
  },
];

export const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

export function findVoice(voiceId: string): CuratedVoice | undefined {
  return CURATED_VOICES.find((v) => v.id === voiceId);
}

export function isAllowedVoice(voiceId: string): boolean {
  return CURATED_VOICES.some((v) => v.id === voiceId);
}

/** Group voices by language for the picker UI. */
export function voicesByLocale(): Record<VoiceLocale, CuratedVoice[]> {
  const out: Record<string, CuratedVoice[]> = {};
  for (const v of CURATED_VOICES) {
    if (!out[v.locale]) out[v.locale] = [];
    out[v.locale].push(v);
  }
  return out as Record<VoiceLocale, CuratedVoice[]>;
}
