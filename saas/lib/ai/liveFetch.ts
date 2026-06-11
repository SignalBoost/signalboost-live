// /saas/lib/ai/liveFetch.ts
// Live web data connector via Tavily Search API.
// Used as an OpenAI function-calling tool so the AI personas can
// answer real-time questions with current internet data.
//
// Required env var (Vercel > signalboost-live > Settings > Env Vars):
//   TAVILY_API_KEY

export interface LiveResult {
  title: string;
  snippet: string;
  url: string;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const FALLBACK_MESSAGE = "No live data available.";
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Sends a query to the search API and returns structured results.
 * Never throws — on any failure it returns an empty array so the
 * AI pipeline degrades gracefully.
 */
export async function fetchLiveData(query: string): Promise<LiveResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    console.error("[liveFetch] TAVILY_API_KEY is not set");
    return [];
  }

  const trimmed = (query || "").trim();
  if (!trimmed) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: trimmed,
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[liveFetch] API returned status ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.results)) {
      console.error("[liveFetch] Unexpected API response shape");
      return [];
    }

    return data.results
      .filter((r: any) => r && r.title && r.url)
      .map((r: any) => ({
        title: String(r.title),
        snippet: String(r.content || "").slice(0, 400),
        url: String(r.url),
      }));
  } catch (err) {
    console.error("[liveFetch] Request failed:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Formats results as a single string for injection into the AI
 * context. Returns the fallback message when nothing is available.
 */
export function formatLiveResults(results: LiveResult[]): string {
  if (!results || results.length === 0) {
    return FALLBACK_MESSAGE;
  }

  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}`
    )
    .join("\n\n");
}

/**
 * One-call convenience: query in, prompt-ready string out.
 */
export async function fetchLiveDataFormatted(query: string): Promise<string> {
  const results = await fetchLiveData(query);
  return formatLiveResults(results);
}
