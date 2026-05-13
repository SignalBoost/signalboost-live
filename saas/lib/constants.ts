import type { GenerationMode } from "@/lib/types";

export const CREDIT_COSTS: Record<GenerationMode, number> = {
  text: 1,
  audio: 2,
  video: 5,
  translate: 1,
  visual: 3,
};
