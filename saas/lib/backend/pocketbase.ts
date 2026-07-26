// saas/lib/backend/pocketbase.ts
import { requirePocketBaseUrl, pocketBaseAdminCredentials } from "./config.ts";

type PocketBaseRecord = Record<string, unknown> & { id: string };

type ListResult<T> = {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
};

let cachedAdminToken: { token: string; expiresAt: number } | null = null;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${requirePocketBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PocketBase ${response.status}: ${body || response.statusText}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function pocketBaseHealth(): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const response = await fetch(`${requirePocketBaseUrl()}/api/health`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PocketBase health check failed" };
  }
}

export async function pocketBaseAdminToken(): Promise<string> {
  if (cachedAdminToken && cachedAdminToken.expiresAt > Date.now() + 60_000) return cachedAdminToken.token;

  const { email, password } = pocketBaseAdminCredentials();
  const auth = await request<{ token: string }>("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: email, password }),
  });

  cachedAdminToken = { token: auth.token, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return auth.token;
}

async function adminHeaders(): Promise<Record<string, string>> {
  return { Authorization: await pocketBaseAdminToken() };
}

export async function listRecords<T extends PocketBaseRecord>(
  collection: string,
  options: { page?: number; perPage?: number; filter?: string; sort?: string; expand?: string } = {},
): Promise<ListResult<T>> {
  const params = new URLSearchParams({
    page: String(options.page || 1),
    perPage: String(options.perPage || 100),
  });
  if (options.filter) params.set("filter", options.filter);
  if (options.sort) params.set("sort", options.sort);
  if (options.expand) params.set("expand", options.expand);

  return request<ListResult<T>>(`/api/collections/${encodeURIComponent(collection)}/records?${params}`, {
    headers: await adminHeaders(),
  });
}

export async function createRecord<T extends PocketBaseRecord>(collection: string, data: Record<string, unknown>): Promise<T> {
  return request<T>(`/api/collections/${encodeURIComponent(collection)}/records`, {
    method: "POST",
    headers: await adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function updateRecord<T extends PocketBaseRecord>(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<T> {
  return request<T>(`/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: await adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function deleteRecord(collection: string, id: string): Promise<void> {
  await request<void>(`/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await adminHeaders(),
  });
}
