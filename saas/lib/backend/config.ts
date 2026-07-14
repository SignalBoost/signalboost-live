export type BackendProvider = "supabase" | "pocketbase";

export function backendProvider(): BackendProvider {
  const value = (process.env.BACKEND_PROVIDER || "supabase").trim().toLowerCase();
  return value === "pocketbase" ? "pocketbase" : "supabase";
}

export function pocketBaseUrl(): string {
  const value = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL || "";
  return value.replace(/\/$/, "");
}

export function requirePocketBaseUrl(): string {
  const url = pocketBaseUrl();
  if (!url) throw new Error("POCKETBASE_URL is not configured");
  return url;
}

export function pocketBaseAdminCredentials(): { email: string; password: string } {
  const email = process.env.POCKETBASE_ADMIN_EMAIL || "";
  const password = process.env.POCKETBASE_ADMIN_PASSWORD || "";
  if (!email || !password) {
    throw new Error("POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD are required");
  }
  return { email, password };
}
