// Level 2 assistant memory: persistent, searchable conversation history.
// Sits on top of Level 1 (assistant_memories). Server-side only.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantChatRow = {
  id: string;
  title: string;
  summary: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

let cachedAdmin: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw new Error("chatMemory: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

function safeParseJSON<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chat lifecycle
// ---------------------------------------------------------------------------

// Returns a valid chat id owned by this user. Creates a new chat when the
// provided id is missing, foreign, or not supplied.
export async function ensureChat(userId: string, chatId?: string | null): Promise<string> {
  const db = admin();
  if (chatId) {
    const { data } = await db
      .from("assistant_chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data && data.id) return data.id;
  }
  const { data, error } = await db
    .from("assistant_chats")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error("chatMemory: could not create chat" + (error ? ": " + error.message : ""));
  }
  return data.id;
}

// Persists one full exchange (user message + assistant reply) and refreshes
// the summary when enough new content has accumulated. Never throws into the
// chat flow: persistence problems are logged and swallowed.
export async function recordTurn(
  userId: string,
  chatId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  try {
    const db = admin();
    const { data, error } = await db
      .from("assistant_chats")
      .select("messages, message_count, last_summarized_count")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();
    if (error || !data) return;

    const messages: AssistantChatMessage[] = Array.isArray(data.messages) ? data.messages : [];
    messages.push(
      { role: "user", content: String(userMessage || "").slice(0, 8000) },
      { role: "assistant", content: String(assistantMessage || "").slice(0, 8000) }
    );
    const newCount = (data.message_count || 0) + 2;

    await db
      .from("assistant_chats")
      .update({
        messages,
        message_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatId)
      .eq("user_id", userId);

    const sinceSummary = newCount - (data.last_summarized_count || 0);
    if (data.last_summarized_count === 0 || sinceSummary >= 6) {
      await summarizeChat(userId, chatId);
    }
  } catch (err) {
    console.error("chatMemory.recordTurn failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Summarization (gpt-4o-mini, JSON-only contract, safeParseJSON guarded)
// ---------------------------------------------------------------------------

async function summarizeChat(userId: string, chatId: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;
  try {
    const db = admin();
    const { data } = await db
      .from("assistant_chats")
      .select("messages, message_count")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();
    if (!data) return;

    const messages: AssistantChatMessage[] = Array.isArray(data.messages) ? data.messages : [];
    if (messages.length === 0) return;

    const transcript = messages
      .slice(-40)
      .map((m) => (m.role === "user" ? "User: " : "Assistant: ") + m.content)
      .join("\n")
      .slice(0, 12000);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              'You summarize a customer-assistant conversation. Respond ONLY with raw JSON, no markdown fences, exactly this shape: {"title": string, "summary": string}. Title: max 8 words. Summary: max 80 words covering topics discussed, decisions made, problems reported, and anything left unresolved. Write both in the same language the user wrote in.',
          },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!res.ok) return;

    const json = await res.json();
    const raw =
      json && json.choices && json.choices[0] && json.choices[0].message
        ? String(json.choices[0].message.content || "")
        : "";
    const parsed = safeParseJSON<{ title?: string; summary?: string }>(raw);
    if (!parsed || !parsed.summary) return;

    await db
      .from("assistant_chats")
      .update({
        title: String(parsed.title || "Conversation").slice(0, 120),
        summary: String(parsed.summary).slice(0, 1000),
        last_summarized_count: data.message_count,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("chatMemory.summarizeChat failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Search + retrieval
// ---------------------------------------------------------------------------

const CHAT_COLUMNS = "id, title, summary, message_count, created_at, updated_at";

export async function searchChats(
  userId: string,
  query: string,
  limit: number = 5
): Promise<AssistantChatRow[]> {
  const db = admin();
  const clean = String(query || "").trim();

  if (!clean) {
    const { data } = await db
      .from("assistant_chats")
      .select(CHAT_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    return data || [];
  }

  const { data: ftsRows } = await db
    .from("assistant_chats")
    .select(CHAT_COLUMNS)
    .eq("user_id", userId)
    .textSearch("search_vector", clean, { type: "websearch", config: "simple" })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (ftsRows && ftsRows.length > 0) return ftsRows;

  const pattern = "%" + clean.replace(/[%_,()]/g, " ").trim() + "%";
  const { data: likeRows } = await db
    .from("assistant_chats")
    .select(CHAT_COLUMNS)
    .eq("user_id", userId)
    .or("title.ilike." + pattern + ",summary.ilike." + pattern)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return likeRows || [];
}

export async function listChats(userId: string, limit: number = 50): Promise<AssistantChatRow[]> {
  const db = admin();
  const { data } = await db
    .from("assistant_chats")
    .select(CHAT_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getChatMessages(
  userId: string,
  chatId: string
): Promise<AssistantChatMessage[] | null> {
  const db = admin();
  const { data, error } = await db
    .from("assistant_chats")
    .select("messages")
    .eq("id", chatId)
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function deleteChat(userId: string, chatId: string): Promise<boolean> {
  const db = admin();
  const { error } = await db
    .from("assistant_chats")
    .delete()
    .eq("id", chatId)
    .eq("user_id", userId);
  return !error;
}

export async function deleteAllChats(userId: string): Promise<boolean> {
  const db = admin();
  const { error } = await db.from("assistant_chats").delete().eq("user_id", userId);
  return !error;
}

// ---------------------------------------------------------------------------
// OpenAI function-calling tool (plug into the assistant route's tools array)
// ---------------------------------------------------------------------------

export const searchPastConversationsTool = {
  type: "function" as const,
  function: {
    name: "searchPastConversations",
    description:
      "Search this user's past conversations with the assistant. Use whenever the user references something discussed before ('like we talked about', 'my earlier issue', 'last time'). Call with a short keyword query to get matching conversations (id, date, title, summary). To read a specific past conversation in full, call again with its chat_id.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "2-5 keywords describing the topic to find in past conversations",
        },
        chat_id: {
          type: "string",
          description: "Optional: id of a specific past conversation to retrieve in full",
        },
      },
    },
  },
};

// Executes the tool call. Always returns a string for the tool result message.
export async function executeSearchPastConversations(
  userId: string,
  args: { query?: string; chat_id?: string },
  currentChatId?: string
): Promise<string> {
  try {
    if (args && args.chat_id) {
      const messages = await getChatMessages(userId, args.chat_id);
      if (!messages || messages.length === 0) return "That conversation was not found.";
      const transcript = messages
        .map((m) => (m.role === "user" ? "User: " : "Assistant: ") + m.content)
        .join("\n");
      return transcript.length > 9000
        ? transcript.slice(0, 9000) + "\n[transcript truncated]"
        : transcript;
    }

    const rows = await searchChats(userId, (args && args.query) || "");
    const filtered = currentChatId ? rows.filter((r) => r.id !== currentChatId) : rows;
    if (filtered.length === 0) {
      return "No past conversations matched that search.";
    }
    return filtered
      .map(
        (r) =>
          "[chat_id: " +
          r.id +
          "] " +
          r.updated_at.slice(0, 10) +
          " — " +
          r.title +
          ": " +
          r.summary
      )
      .join("\n");
  } catch (err) {
    console.error("executeSearchPastConversations failed:", err);
    return "Past-conversation search is temporarily unavailable.";
  }
}
