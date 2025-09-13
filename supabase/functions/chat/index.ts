// Supabase Edge Function (Deno) - Chat streaming via OpenRouter
// Expects Authorization: Bearer <JWT> from client
// Body: { message: string, sessionId?: string, history?: Array<{ role: string; content: string }> }

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore - Supabase client for Deno
import { createClient } from "npm:@supabase/supabase-js@2";

type ChatBody = {
  message: string;
  sessionId?: string;
  history?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const cors = (headers: Headers) => {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
};

// @ts-ignore - Deno.serve is available in Supabase Edge Functions
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const headers = new Headers();
    cors(headers);
    return new Response("ok", { headers });
  }

  const headers = new Headers();
  cors(headers);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401, headers });

    const supabase = createClient(
      // @ts-ignore - Deno.env is available in Supabase Edge Functions
      Deno.env.get("SUPABASE_URL")!,
      // @ts-ignore - Deno.env is available in Supabase Edge Functions
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return new Response("Unauthorized", { status: 401, headers });
    const userId = userData.user.id;

    const body = (await req.json()) as ChatBody;
    if (!body?.message || typeof body.message !== "string") {
      return new Response("Invalid payload", { status: 400, headers });
    }

    // Require an existing session id; do not auto-create here
    const sessionId = body.sessionId;
    if (!sessionId) return new Response("Missing sessionId", { status: 400, headers });
    // Validate the session belongs to the user
    const { data: valid, error: vErr } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (vErr || !valid) return new Response("Invalid session", { status: 403, headers });

    // Persist the user message and set a title if empty (first message)
    const userMessage = { session_id: sessionId, user_id: userId, role: "user", content: body.message };
    const [insertResult, updateResult] = await Promise.all([
      supabase.from("chat_messages").insert(userMessage),
      supabase.from("chat_sessions").update({ title: body.message.slice(0, 80) }).eq("id", sessionId).is("title", null),
    ]);
    if (insertResult.error) return new Response("Failed to save message", { status: 500, headers });

    // Build messages to send (system + last 20 messages from DB)
    const systemPrompt = {
      role: "system" as const,
      content:
        "You are a helpful, concise assistant. Answer clearly and factually. If asked about current events, answer with best effort without disclaimers unless necessary.",
    };
    const { data: past, error: pastErr } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(40);
    if (pastErr) console.warn("[edge] failed to load history", pastErr);
    const pastMsgs = (past ?? []).map((m: any) => ({ role: m.role, content: m.content })).slice(-20);
    const messages = [systemPrompt, ...pastMsgs];

    // @ts-ignore - Deno.env is available in Supabase Edge Functions
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) return new Response("Server misconfigured", { status: 500, headers });

    const doFetch = async (stream: boolean) => {
      return await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          // @ts-ignore - Deno.env is available in Supabase Edge Functions
          "HTTP-Referer": Deno.env.get("OPENROUTER_SITE_URL") ?? "",
          // @ts-ignore - Deno.env is available in Supabase Edge Functions
          "X-Title": Deno.env.get("OPENROUTER_APP_TITLE") ?? "Supabase Chat",
        },
        body: JSON.stringify({
          // @ts-ignore - Deno.env is available in Supabase Edge Functions
          model: Deno.env.get("OPENROUTER_MODEL") ?? "openrouter/auto",
          messages,
          temperature: 0.2,
          max_tokens: 512,
          stream,
        }),
      });
    };

    const withRetry = async (fn: () => Promise<Response>, attempts = 2) => {
      let lastErr: unknown = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const resp = await fn();
          if (!resp.ok) {
            const text = await resp.text().catch(() => "");
            console.warn("[edge] upstream not ok", resp.status, text);
            lastErr = new Error(`Upstream ${resp.status}`);
          } else {
            return resp;
          }
        } catch (e) {
          console.warn("[edge] upstream error", e);
          lastErr = e;
        }
        const backoffMs = 300 * (i + 1) + Math.floor(Math.random() * 200);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
      throw lastErr ?? new Error("Upstream failed");
    };

    // For reliability, use non-streaming by default (can re-enable streaming later)
    let orReq: Response | null = null;
    try {
      orReq = await withRetry(() => doFetch(false), 2);
    } catch (e) {
      console.error("[edge] upstream failed after retries", e);
      return new Response("Upstream error", { status: 502, headers });
    }

    if (!orReq.ok) {
      const bodyText = await orReq.text().catch(() => "");
      headers.set("Content-Type", "application/json");
      return new Response(
        JSON.stringify({ error: "UpstreamNotOK", status: orReq.status, body: bodyText }),
        { status: 502, headers }
      );
    }

    const json = await orReq.json().catch(() => null);
    let content = "";
    try {
      // Prefer chat-style content; fallback to text
      content = json?.choices?.[0]?.message?.content
        ?? json?.choices?.[0]?.text
        ?? "";
      if (!content && Array.isArray(json?.choices)) {
        // Concatenate any available content fields
        content = json.choices.map((c: any) => c?.message?.content || c?.text || "").join("").trim();
      }
    } catch (e) {
      console.warn("[edge] parse content error", e);
    }
    if (!content) {
      console.warn("[edge] empty content from upstream", json);
    }
    if (content) await supabase.from("chat_messages").insert({ session_id: sessionId, user_id: userId, role: "assistant", content });
    headers.set("Content-Type", "application/json");
    headers.set("x-chat-session-id", sessionId);
    return new Response(JSON.stringify({ content }), { headers, status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("Internal error", { status: 500, headers });
  }
});
