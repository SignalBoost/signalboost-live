// History + privacy endpoints for assistant conversations.
// GET    /api/assistant/chats           -> list this user's chats
// GET    /api/assistant/chats?id=UUID   -> full transcript of one chat
// DELETE /api/assistant/chats?id=UUID   -> delete one chat
// DELETE /api/assistant/chats?all=true  -> delete all chats for this user
// Auth: Authorization: Bearer <supabase access token>

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  listChats,
  getChatMessages,
  deleteChat,
  deleteAllChats,
} from "../../../../lib/assistant/chatMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authedUserId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anon) return null;
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user.id;
}

export async function GET(req: NextRequest) {
  const userId = await authedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const messages = await getChatMessages(userId, id);
    if (messages === null) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    return NextResponse.json({ id, messages });
  }
  const chats = await listChats(userId);
  return NextResponse.json({ chats });
}

export async function DELETE(req: NextRequest) {
  const userId = await authedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  if (params.get("all") === "true") {
    const ok = await deleteAllChats(userId);
    return ok
      ? NextResponse.json({ deleted: "all" })
      : NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  const id = params.get("id");
  if (!id) {
    return NextResponse.json({ error: "Provide id or all=true" }, { status: 400 });
  }
  const ok = await deleteChat(userId, id);
  return ok
    ? NextResponse.json({ deleted: id })
    : NextResponse.json({ error: "Delete failed" }, { status: 500 });
}
