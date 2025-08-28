import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../supabaseClient";

type ChatMessage = { id?: number; role: "user" | "assistant" | "system"; content: string };

const ChatPane = ({
  sessionId,
  onCreateNewSession,
}: {
  sessionId: string | null;
  onCreateNewSession: () => Promise<string | null> | string | null;
}) => {
  const { session } = UserAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  const functionUrl = useMemo(() => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, []);

  useEffect(() => {
    const loadHistory = async () => {
      if (!sessionId) return;
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .eq("session_id", sessionId)
        .order("id", { ascending: true });
      if (!error && data) setMessages(data as ChatMessage[]);
    };
    setMessages([]);
    void loadHistory();
  }, [sessionId]);

  const stop = () => {
    abortRef.current?.abort();
  };

  const sendMessage = async () => {
    if (!session?.access_token || !input.trim() || sending) return;
    if (!sessionId) return;
    setSending(true);
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userText }]);

    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ message: userText, sessionId }),
      signal: controller.signal,
    });

    const contentType = res.headers.get("Content-Type") || "";
    if (!res.ok) {
      setSending(false);
      return;
    }
    if (contentType.includes("application/json")) {
      const json = await res.json().catch(() => null);
      const content = json?.content ?? "";
      if (content) setMessages((prev) => [...prev, { role: "assistant", content }]);
      setSending(false);
      abortRef.current = null;
      return;
    }

    if (!res.body) {
      setSending(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assistantStarted = false;
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.replace(/^data:\s*/, "");
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta: string = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? "";
            if (!assistantStarted) {
              assistantStarted = true;
              setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
            }
            if (delta) {
              setMessages((prev) => {
                const copy = prev.slice();
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") last.content += String(delta);
                return copy;
              });
            }
          } catch {
            // ignore
          }
        }
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0 16px" }}>
        {!sessionId && (
          <div style={{ padding: 12, marginBottom: 8, background: "#0b1220", color: "#93c5fd", border: "1px solid #1d4ed8", borderRadius: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>Select or create a conversation to start chatting.</span>
              <button
                onClick={async () => {
                  const created = await onCreateNewSession();
                  void created;
                }}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #1d4ed8", background: "#0b1220", color: "#93c5fd" }}
              >
                New
              </button>
            </div>
          </div>
        )}
        <div style={{ paddingBottom: 16 }}>
          {messages.map((m, idx) => (
            <div key={m.id ?? idx} style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>{m.role === "user" ? "You" : m.role === "assistant" ? "AI" : "System"}</div>
              <div style={{ background: m.role === "user" ? "#0f172a" : "#0b1220", border: "1px solid #1f2937", padding: 12, borderRadius: 8 }}>
                {m.content}
              </div>
            </div>
          ))}
          {messages.length === 0 && <div style={{ color: "#9ca3af" }}>Start the conversation…</div>}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #1f2937", background: "#0b0f14" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message"
          disabled={sending || !sessionId}
          style={{ flex: 1, padding: 12, border: "1px solid #1f2937", borderRadius: 9999, background: "#0f172a", color: "#e5e7eb" }}
        />
        <button type="submit" disabled={sending || !input.trim() || !sessionId} style={{ padding: "10px 16px", borderRadius: 9999, border: "1px solid #1d4ed8", background: "#0b1220", color: "#93c5fd" }}>Send</button>
      </form>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { session, signOut } = UserAuth();
  const [sessions, setSessions] = useState<Array<{ id: string; title: string | null; last_message: string | null; updated_at: string }>>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const initializedRef = useRef<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const createNewSession = async () => {
    if (!session) return null;
    const { data, error } = await supabase.from("chat_sessions").insert({ user_id: session.user.id }).select("id, title, updated_at").single();
    if (error || !data) return null;
    setActiveSessionId(data.id);
    setSessions((prev) => [{ id: data.id, title: data.title, last_message: null, updated_at: data.updated_at }, ...prev]);
    return data.id as string;
  };

  const deleteSessions = async (ids: string[]) => {
    if (!session || ids.length === 0) return;
    await supabase.from("chat_sessions").delete().in("id", ids);
    setSessions((prev) => prev.filter((s) => !ids.includes(s.id)));
    setSelectedIds(new Set());
    if (activeSessionId && ids.includes(activeSessionId)) {
      const first = sessions.find((s) => !ids.includes(s.id));
      setActiveSessionId(first ? first.id : null);
    }
  };

  const canQuery = useMemo(() => !!session, [session]);

  useEffect(() => {
    if (!canQuery || initializedRef.current) return;
    const initialize = async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) return;
      // Fetch latest message preview
      const ids = (data ?? []).map((d) => d.id);
      let latestBySession = new Map<string, string>();
      if (ids.length > 0) {
        const { data: msgs } = await supabase
          .from("chat_messages")
          .select("session_id, content, created_at")
          .in("session_id", ids)
          .order("created_at", { ascending: false });
        latestBySession = new Map<string, string>();
        (msgs ?? []).forEach((m) => {
          if (!latestBySession.has(m.session_id)) latestBySession.set(m.session_id, m.content);
        });
      }
      const list = (data ?? []).map((d) => ({ id: d.id, title: d.title, updated_at: d.updated_at, last_message: latestBySession.get(d.id) ?? null }));
      setSessions(list);
      if (list.length === 0) {
        const id = await createNewSession();
        if (!id) return;
      } else {
        setActiveSessionId(list[0].id);
      }
      initializedRef.current = true;
    };
    void initialize();
  }, [canQuery, session]);
  const navigate = useNavigate();

  const handleSignOut = async (e: React.MouseEvent<HTMLParagraphElement>) => {
    e.preventDefault();
    await signOut();
    navigate("/");
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh", overflow: "hidden", width: "100%", background: "#0b0f14", color: "#e5e7eb" }}>
      <aside style={{ position: "sticky", top: 0, height: "100vh", borderRight: "1px solid #1f2937", padding: 12, overflowY: "auto", maxWidth: 280, background: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
          <strong style={{ color: "#e2e8f0" }}>Conversations</strong>
          <div style={{ display: "flex", gap: 6 }}>
            {selectedIds.size > 0 && (
              <button
                onClick={() => void deleteSessions(Array.from(selectedIds))}
                title="Delete selected"
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #7f1d1d", background: "#1f0b0b", color: "#fecaca" }}
              >
                Delete ({selectedIds.size})
              </button>
            )}
            <button onClick={() => void createNewSession()} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #1d4ed8", background: "#0b1220", color: "#93c5fd" }}>
              New
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr auto",
                gap: 8,
                alignItems: "center",
                padding: 8,
                borderRadius: 6,
                border: "1px solid #1f2937",
                boxShadow: s.id === activeSessionId ? "0 0 0 2px rgba(59,130,246,0.35) inset" : "none",
                background: "#0b1220",
                width: "100%",
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(s.id)}
                onChange={(e) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(s.id); else next.delete(s.id);
                    return next;
                  });
                }}
                aria-label="Select conversation"
              />
              <button onClick={() => setActiveSessionId(s.id)} style={{ textAlign: "left", width: "100%", background: "transparent", border: 0, padding: 0, cursor: "pointer", color: "#e5e7eb" }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {(() => {
                    const raw = s.title && s.title.trim().length > 0
                      ? s.title
                      : (s.last_message && s.last_message.trim().length > 0 ? s.last_message : "New chat");
                    const trimmed = raw.trim();
                    return trimmed.length > 30 ? `${trimmed.slice(0, 30)} …` : trimmed;
                  })()}
                </div>
              </button>
              <button
                onClick={() => void deleteSessions([s.id])}
                title="Delete conversation"
                aria-label="Delete conversation"
                style={{ background: "transparent", border: 0, color: "#fca5a5", cursor: "pointer" }}
              >
                🗑️
              </button>
            </div>
          ))}
          {sessions.length === 0 && <div style={{ color: "#94a3b8", fontSize: 12 }}>No conversations yet</div>}
        </div>
        <div style={{ marginTop: 16 }}>
          <p onClick={handleSignOut} className="hover:cursor-pointer inline-block px-4 py-2" style={{ border: "1px solid #334155", borderRadius: 6 }}>
            Sign out
          </p>
        </div>
      </aside>
      <main style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <header style={{ padding: 12, borderBottom: "1px solid #1f2937" }}>
          <h2 style={{ margin: 0, fontSize: 16, color: "#cbd5e1" }}>Welcome, {session?.user?.email}</h2>
        </header>
        <section style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <ChatPane sessionId={activeSessionId} onCreateNewSession={createNewSession} />
          </div>
          <div style={{ padding: 12, borderTop: "1px solid #1f2937", background: "#0b0f14" }}>
            {/* dummy spacer to emulate fixed input in ChatPane */}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Dashboard;