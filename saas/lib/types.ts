export type GenerationMode =
  | "text"
  | "audio"
  | "video"
  | "translate"
  | "visual";

export interface HistoryItem {
  id: number;
  user_id: string;
  mode: GenerationMode;
  prompt: string;
  output: string;
  path?: string | null;
  created_at: string;
}

export interface CreditRow {
  user_id: string;
  used: number;
  credit_limit: number;
  updated_at: string;
}
